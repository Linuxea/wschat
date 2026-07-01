import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MomentVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { RealtimeService } from '../common/realtime/realtime.service';
import { PUBLIC_USER_SELECT } from '../users/users.service';
import { CreateMomentDto, CommentDto } from './dto';

const MOMENT_INCLUDE = {
  author: { select: PUBLIC_USER_SELECT },
  likes: { select: { userId: true } },
  comments: {
    include: { user: { select: PUBLIC_USER_SELECT } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MomentInclude;

@Injectable()
export class MomentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, dto: CreateMomentDto) {
    const enc = this.crypto.encrypt(dto.content);
    const moment = await this.prisma.moment.create({
      data: {
        authorId: userId,
        content: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        media: dto.media ?? Prisma.JsonNull,
        visibility: dto.visibility,
        specifiedIds: dto.specifiedIds ?? [],
      },
      include: MOMENT_INCLUDE,
    });
    return this.toView(moment, userId);
  }

  async feed(userId: string, before?: string, limit = 30) {
    const friends = await this.prisma.friendship.findMany({
      where: { ownerId: userId, momentsBlocked: false },
      select: { friendId: true },
    });
    const friendIds = friends.map((f) => f.friendId);

    const moments = await this.prisma.moment.findMany({
      where: {
        OR: [
          { authorId: userId },
          { authorId: { in: friendIds }, visibility: MomentVisibility.PUBLIC },
          { authorId: { in: friendIds }, visibility: MomentVisibility.FRIENDS },
          {
            authorId: { in: friendIds },
            visibility: MomentVisibility.SPECIFIED,
            specifiedIds: { has: userId },
          },
        ],
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: MOMENT_INCLUDE,
    });

    return moments.map((m) => this.toView(m, userId));
  }

  async findByUser(userId: string, targetUserId: string) {
    const isSelf = userId === targetUserId;
    let isFriend = false;
    let momentsBlocked = false;
    if (!isSelf) {
      const fs = await this.prisma.friendship.findUnique({
        where: { ownerId_friendId: { ownerId: userId, friendId: targetUserId } },
      });
      isFriend = !!fs;
      momentsBlocked = !!fs?.momentsBlocked;
    }
    if (momentsBlocked) return [];

    const where: Prisma.MomentWhereInput = { authorId: targetUserId };
    if (!isSelf) {
      where.OR = [
        { visibility: MomentVisibility.PUBLIC },
        ...(isFriend ? [{ visibility: MomentVisibility.FRIENDS }] : []),
        { visibility: MomentVisibility.SPECIFIED, specifiedIds: { has: userId } },
      ];
    }
    const moments = await this.prisma.moment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: MOMENT_INCLUDE,
    });
    return moments.map((m) => this.toView(m, userId));
  }

  async findOne(id: string, userId: string) {
    const moment = await this.prisma.moment.findUnique({ where: { id }, include: MOMENT_INCLUDE });
    if (!moment) throw new NotFoundException('moment not found');
    return this.toView(moment, userId);
  }

  async toggleLike(id: string, userId: string) {
    const moment = await this.prisma.moment.findUnique({ where: { id } });
    if (!moment) throw new NotFoundException('moment not found');
    const existing = await this.prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId: id, userId } },
    });
    if (existing) {
      await this.prisma.momentLike.delete({ where: { momentId_userId: { momentId: id, userId } } });
      this.realtime.emitToUser(moment.authorId, 'moment:like', { momentId: id, userId, liked: false });
      return { liked: false };
    }
    await this.prisma.momentLike.create({ data: { momentId: id, userId } });
    this.realtime.emitToUser(moment.authorId, 'moment:like', { momentId: id, userId, liked: true });
    return { liked: true };
  }

  async comment(id: string, userId: string, dto: CommentDto) {
    const moment = await this.prisma.moment.findUnique({ where: { id } });
    if (!moment) throw new NotFoundException('moment not found');
    const comment = await this.prisma.momentComment.create({
      data: { momentId: id, userId, content: dto.content, replyToUserId: dto.replyToUserId ?? null },
      include: { user: { select: PUBLIC_USER_SELECT } },
    });
    this.realtime.emitToUser(moment.authorId, 'moment:comment', { momentId: id, comment });
    return comment;
  }

  async deleteComment(commentId: string, userId: string) {
    const c = await this.prisma.momentComment.findUnique({ where: { id: commentId } });
    if (!c) throw new NotFoundException('comment not found');
    if (c.userId !== userId) throw new ForbiddenException('not your comment');
    await this.prisma.momentComment.delete({ where: { id: commentId } });
    return { ok: true };
  }

  async delete(id: string, userId: string) {
    const moment = await this.prisma.moment.findUnique({ where: { id } });
    if (!moment) throw new NotFoundException('moment not found');
    if (moment.authorId !== userId) throw new ForbiddenException('not your moment');
    await this.prisma.moment.delete({ where: { id } });
    return { ok: true };
  }

  private toView(
    m: Prisma.MomentGetPayload<{ include: typeof MOMENT_INCLUDE }>,
    meId: string,
  ) {
    let content = '';
    try {
      content = this.crypto.decrypt({ ciphertext: m.content, iv: m.iv, authTag: m.authTag });
    } catch {
      content = '';
    }
    return {
      id: m.id,
      author: m.author,
      content,
      media: m.media,
      visibility: m.visibility,
      createdAt: m.createdAt,
      likeCount: m.likes.length,
      likedByMe: m.likes.some((l) => l.userId === meId),
      commentCount: m.comments.length,
      comments: m.comments.map((c) => ({
        id: c.id,
        user: c.user,
        content: c.content,
        replyToUserId: c.replyToUserId,
        createdAt: c.createdAt,
      })),
    };
  }
}
