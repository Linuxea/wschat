import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../common/realtime/realtime.service';
import { PUBLIC_USER_SELECT } from '../users/users.service';
import { CreateGroupDto, InviteDto, UpdateGroupDto } from './dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, dto: CreateGroupDto) {
    const uniqueMembers = Array.from(new Set([...dto.memberIds, userId]));
    const conv = await this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        name: dto.name,
        avatar: dto.avatar,
        ownerId: userId,
        members: {
          create: uniqueMembers.map((id) => ({
            userId: id,
            role: id === userId ? MemberRole.OWNER : MemberRole.MEMBER,
          })),
        },
      },
      include: { members: { include: { user: { select: PUBLIC_USER_SELECT } } } },
    });

    for (const m of conv.members) {
      if (m.userId !== userId) {
        this.realtime.emitToUser(m.userId, 'conversation:new', { conversationId: conv.id });
      }
    }
    return conv;
  }

  async list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { type: 'GROUP', members: { some: { userId } } },
      include: { members: { include: { user: { select: PUBLIC_USER_SELECT } } } },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    await this.assertMember(id, userId);
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: { members: { include: { user: { select: PUBLIC_USER_SELECT } } } },
    });
    if (!conv || conv.type !== 'GROUP') throw new NotFoundException('group not found');
    return conv;
  }

  async update(id: string, userId: string, dto: UpdateGroupDto) {
    await this.assertPrivileged(id, userId);
    return this.prisma.conversation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
        ...(dto.announcement !== undefined ? { announcement: dto.announcement } : {}),
      },
      include: { members: { include: { user: { select: PUBLIC_USER_SELECT } } } },
    });
  }

  async invite(id: string, userId: string, dto: InviteDto) {
    await this.assertPrivileged(id, userId);
    const existing = await this.prisma.conversationMember.findMany({
      where: { conversationId: id, userId: { in: dto.userIds } },
      select: { userId: true },
    });
    const already = new Set(existing.map((m) => m.userId));
    const toAdd = dto.userIds.filter((u) => !already.has(u));
    if (toAdd.length === 0) throw new BadRequestException('all users already members');

    await this.prisma.conversationMember.createMany({
      data: toAdd.map((u) => ({ conversationId: id, userId: u, role: MemberRole.MEMBER })),
    });

    for (const u of toAdd) {
      this.realtime.emitToUser(u, 'conversation:new', { conversationId: id });
    }
    return { added: toAdd.length };
  }

  async kick(id: string, userId: string, targetId: string) {
    await this.assertPrivileged(id, userId);
    const target = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: targetId } },
    });
    if (!target) throw new NotFoundException('member not found');
    if (target.role === MemberRole.OWNER) {
      throw new BadRequestException('cannot kick the owner');
    }
    await this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId: id, userId: targetId } },
    });
    this.realtime.emitToUser(targetId, 'conversation:removed', { conversationId: id });
    return { ok: true };
  }

  async leave(id: string, userId: string) {
    const member = await this.assertMember(id, userId);
    await this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    const remaining = await this.prisma.conversationMember.count({ where: { conversationId: id } });
    if (remaining === 0) {
      await this.prisma.conversation.delete({ where: { id } });
      return { disbanded: true };
    }
    if (member.role === MemberRole.OWNER) {
      // promote oldest admin, else oldest member
      const successor = await this.prisma.conversationMember.findFirst({
        where: { conversationId: id },
        orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
      });
      if (successor) {
        await this.prisma.conversationMember.update({
          where: { id: successor.id },
          data: { role: MemberRole.OWNER },
        });
        await this.prisma.conversation.update({ where: { id }, data: { ownerId: successor.userId } });
      }
    }
    return { ok: true };
  }

  private async assertMember(conversationId: string, userId: string) {
    const m = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!m) throw new ForbiddenException('not a group member');
    return m;
  }

  private async assertPrivileged(conversationId: string, userId: string) {
    const m = await this.assertMember(conversationId, userId);
    if (m.role === MemberRole.MEMBER) {
      throw new ForbiddenException('only owner / admin can do this');
    }
    return m;
  }
}
