import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { PUBLIC_USER_SELECT } from '../users/users.service';

export interface ConversationView {
  id: string;
  type: 'PRIVATE' | 'GROUP';
  name: string | null;
  avatar: string | null;
  ownerId: string | null;
  announcement: string | null;
  pinned: boolean;
  muted: boolean;
  lastReadSeq: number;
  unread: number;
  members: Array<{
    userId: string;
    username: string;
    nickname: string;
    avatar: string | null;
    role: string;
    remark: string | null;
  }>;
  lastMessage: {
    id: string;
    type: string;
    preview: string;
    senderId: string;
    seq: number;
    createdAt: Date;
  } | null;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private async remarkMap(userId: string): Promise<Map<string, string>> {
    const rows = await this.prisma.friendship.findMany({
      where: { ownerId: userId, NOT: { remark: null } },
      select: { friendId: true, remark: true },
    });
    const m = new Map<string, string>();
    for (const r of rows) if (r.remark) m.set(r.friendId, r.remark);
    return m;
  }

  async list(userId: string): Promise<ConversationView[]> {
    const [memberships, rmap] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { userId },
        include: {
          conversation: {
            include: {
              members: { include: { user: { select: PUBLIC_USER_SELECT } } },
            },
          },
        },
        orderBy: [{ isPinned: 'desc' }, { conversation: { lastMessageAt: 'desc' } }],
      }),
      this.remarkMap(userId),
    ]);

    const views: ConversationView[] = [];
    for (const m of memberships) {
      const conv = m.conversation;
      const lastMessage = await this.prisma.message.findFirst({
        where: { conversationId: conv.id },
        orderBy: { seq: 'desc' },
      });
      views.push({
        id: conv.id,
        type: conv.type,
        name: conv.name,
        avatar: conv.avatar,
        ownerId: conv.ownerId,
        announcement: conv.announcement,
        pinned: m.isPinned,
        muted: m.isMuted,
        lastReadSeq: m.lastReadSeq,
        unread: Math.max(0, conv.currentSeq - m.lastReadSeq),
        members: conv.members.map((mm) => ({
          userId: mm.userId,
          username: mm.user.username,
          nickname: mm.user.nickname,
          avatar: mm.user.avatar,
          role: mm.role,
          remark: rmap.get(mm.userId) || null,
        })),
        lastMessage: lastMessage ? this.toPreview(lastMessage) : null,
      });
    }
    return views;
  }

  private toPreview(msg: {
    id: string;
    type: string;
    content: string;
    iv: string;
    authTag: string;
    senderId: string;
    seq: number;
    createdAt: Date;
    deletedAt: Date | null;
  }): ConversationView['lastMessage'] {
    let preview = '';
    if (msg.deletedAt) {
      preview = '消息已撤回';
    } else if (msg.type === 'TEXT' || msg.type === 'EMOJI') {
      try {
        preview = this.crypto.decrypt({ ciphertext: msg.content, iv: msg.iv, authTag: msg.authTag });
      } catch {
        preview = '[无法解密]';
      }
    } else {
      preview = TYPE_PREVIEW[msg.type as keyof typeof TYPE_PREVIEW] ?? '[消息]';
    }
    return {
      id: msg.id,
      type: msg.type,
      preview,
      senderId: msg.senderId,
      seq: msg.seq,
      createdAt: msg.createdAt,
    };
  }

  async assertMember(conversationId: string, userId: string) {
    const m = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!m) throw new ForbiddenException('not a conversation member');
    return m;
  }

  async findOne(conversationId: string, userId: string): Promise<ConversationView> {
    await this.assertMember(conversationId, userId);
    const [conv, rmap] = await Promise.all([
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { members: { include: { user: { select: PUBLIC_USER_SELECT } } } },
      }),
      this.remarkMap(userId),
    ]);
    if (!conv) throw new NotFoundException('conversation not found');
    const member = conv.members.find((mm) => mm.userId === userId)!;
    const lastMessage = await this.prisma.message.findFirst({
      where: { conversationId: conv.id },
      orderBy: { seq: 'desc' },
    });
    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      avatar: conv.avatar,
      ownerId: conv.ownerId,
      announcement: conv.announcement,
      pinned: member.isPinned,
      muted: member.isMuted,
      lastReadSeq: member.lastReadSeq,
      unread: Math.max(0, conv.currentSeq - member.lastReadSeq),
      members: conv.members.map((mm) => ({
        userId: mm.userId,
        username: mm.user.username,
        nickname: mm.user.nickname,
        avatar: mm.user.avatar,
        role: mm.role,
        remark: rmap.get(mm.userId) || null,
      })),
      lastMessage: lastMessage ? this.toPreview(lastMessage) : null,
    };
  }

  async markRead(conversationId: string, userId: string, seq: number) {
    await this.assertMember(conversationId, userId);
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadSeq: { set: Math.max(0, seq) } },
    });
  }

  async setPinned(conversationId: string, userId: string, pinned: boolean) {
    await this.assertMember(conversationId, userId);
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isPinned: pinned },
    });
  }

  async setMuted(conversationId: string, userId: string, muted: boolean) {
    await this.assertMember(conversationId, userId);
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isMuted: muted },
    });
  }
}

const TYPE_PREVIEW: Record<string, string> = {
  IMAGE: '[图片]',
  VOICE: '[语音]',
  VIDEO: '[视频]',
  FILE: '[文件]',
  SYSTEM: '[系统消息]',
};
