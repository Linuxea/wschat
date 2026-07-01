import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, FriendRequestStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/users.service';
import { SendRequestDto, UpdateRemarkDto, CreateTagDto, SetFriendTagsDto } from './dto';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Friend requests ----------------

  async sendRequest(fromId: string, dto: SendRequestDto) {
    if (dto.toId === fromId) throw new BadRequestException('cannot add yourself');

    const to = await this.prisma.user.findUnique({ where: { id: dto.toId } });
    if (!to) throw new NotFoundException('target user not found');

    const existingFriend = await this.prisma.friendship.findUnique({
      where: { ownerId_friendId: { ownerId: fromId, friendId: dto.toId } },
    });
    if (existingFriend) throw new ConflictException('already friends');

    const existingReq = await this.prisma.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.PENDING,
        OR: [
          { fromId, toId: dto.toId },
          { fromId: dto.toId, toId: fromId },
        ],
      },
    });
    if (existingReq) throw new ConflictException('a pending request already exists');

    const blockedByTarget = await this.prisma.friendship.findUnique({
      where: { ownerId_friendId: { ownerId: dto.toId, friendId: fromId } },
    });
    if (blockedByTarget?.isBlocked) {
      throw new BadRequestException('cannot send request to this user');
    }

    return this.prisma.friendRequest.create({
      data: { fromId, toId: dto.toId, message: dto.message },
      include: { from: { select: PUBLIC_USER_SELECT }, to: { select: PUBLIC_USER_SELECT } },
    });
  }

  listIncoming(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { toId: userId, status: FriendRequestStatus.PENDING },
      include: { from: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  listOutgoing(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { fromId: userId, status: FriendRequestStatus.PENDING },
      include: { to: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptRequest(userId: string, requestId: string) {
    const req = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('request not found');
    if (req.toId !== userId) throw new BadRequestException('not your request');
    if (req.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('request already handled');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.friendRequest.update({ where: { id: requestId }, data: { status: FriendRequestStatus.ACCEPTED } });

      // bidirectional friendship (idempotent via upsert)
      await tx.friendship.upsert({
        where: { ownerId_friendId: { ownerId: req.fromId, friendId: req.toId } },
        update: {},
        create: { ownerId: req.fromId, friendId: req.toId },
      });
      await tx.friendship.upsert({
        where: { ownerId_friendId: { ownerId: req.toId, friendId: req.fromId } },
        update: {},
        create: { ownerId: req.toId, friendId: req.fromId },
      });

      // ensure a private conversation exists between the two
      await this.ensurePrivateConversation(tx, req.fromId, req.toId);
    });

    return { ok: true };
  }

  async rejectRequest(userId: string, requestId: string) {
    const req = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('request not found');
    if (req.toId !== userId) throw new BadRequestException('not your request');
    if (req.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('request already handled');
    }
    await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.REJECTED },
    });
    return { ok: true };
  }

  private async ensurePrivateConversation(tx: Prisma.TransactionClient, aId: string, bId: string) {
    const existing = await tx.conversation.findFirst({
      where: {
        type: 'PRIVATE',
        AND: [{ members: { some: { userId: aId } } }, { members: { some: { userId: bId } } }],
      },
    });
    if (existing) return existing;
    return tx.conversation.create({
      data: {
        type: 'PRIVATE',
        members: { create: [{ userId: aId }, { userId: bId }] },
      },
    });
  }

  // ---------------- Friends list & profile ----------------

  list(userId: string) {
    return this.prisma.friendship.findMany({
      where: { ownerId: userId },
      include: {
        friend: { select: PUBLIC_USER_SELECT },
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateRemark(userId: string, friendId: string, dto: UpdateRemarkDto) {
    await this.getOwnedFriendshipOrThrow(userId, friendId);
    return this.prisma.friendship.update({
      where: { ownerId_friendId: { ownerId: userId, friendId } },
      data: { remark: dto.remark ?? null },
    });
  }

  async setBlocked(userId: string, friendId: string, blocked: boolean) {
    await this.getOwnedFriendshipOrThrow(userId, friendId);
    return this.prisma.friendship.update({
      where: { ownerId_friendId: { ownerId: userId, friendId } },
      data: { isBlocked: blocked },
    });
  }

  async setMomentsBlocked(userId: string, friendId: string, blocked: boolean) {
    await this.getOwnedFriendshipOrThrow(userId, friendId);
    return this.prisma.friendship.update({
      where: { ownerId_friendId: { ownerId: userId, friendId } },
      data: { momentsBlocked: blocked },
    });
  }

  private async getOwnedFriendshipOrThrow(userId: string, friendId: string) {
    const fs = await this.prisma.friendship.findUnique({
      where: { ownerId_friendId: { ownerId: userId, friendId } },
    });
    if (!fs) throw new NotFoundException('friendship not found');
    return fs;
  }

  // ---------------- Tags ----------------

  listTags(userId: string) {
    return this.prisma.tag.findMany({
      where: { ownerId: userId },
      include: { friends: { include: { friendship: { include: { friend: { select: PUBLIC_USER_SELECT } } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTag(userId: string, dto: CreateTagDto) {
    try {
      return await this.prisma.tag.create({ data: { ownerId: userId, name: dto.name } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('tag name already exists');
      }
      throw e;
    }
  }

  async deleteTag(userId: string, tagId: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.ownerId !== userId) throw new NotFoundException('tag not found');
    await this.prisma.tag.delete({ where: { id: tagId } });
    return { ok: true };
  }

  async setFriendTags(userId: string, friendId: string, dto: SetFriendTagsDto) {
    const fs = await this.getOwnedFriendshipOrThrow(userId, friendId);
    await this.prisma.$transaction([
      this.prisma.friendTag.deleteMany({ where: { friendshipId: fs.id } }),
      ...dto.tagIds.map((tagId) =>
        this.prisma.friendTag.create({
          data: { friendshipId: fs.id, tagId },
        }),
      ),
    ]);
    return { ok: true };
  }
}
