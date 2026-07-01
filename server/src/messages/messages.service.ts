import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { MessageType } from '@prisma/client';
import { nanoid } from 'nanoid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { RealtimeService } from '../common/realtime/realtime.service';
import { SendMessageDto } from './dto';

const RECALL_WINDOW_MS = 2 * 60 * 1000;

/** '@所有人' 的哨兵值，客户端选择「所有人」时在 mentions 中传入；服务端展开为全体成员，存储列保留原始哨兵。 */
export const ALL_SENTINEL = '__all__';

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string; // decrypted plaintext
  seq: number;
  clientMsgId: string;
  replyToId: string | null;
  mentions: string[]; //被 @ 的 userId 列表，可能含 '__all__' 哨兵
  createdAt: Date;
  deletedAt: Date | null;
}

/** Insert a space between every CJK char so that Postgres 'simple' tsvector
 *  can index individual characters — enables keyword search for Chinese text. */
export function tokenizeForSearch(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
  ) {}

  async send(senderId: string, dto: SendMessageDto): Promise<{
    ack: { id: string; clientMsgId: string; seq: number; createdAt: Date; rejected: boolean };
    message: MessageView;
  }> {
    // 1. membership
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: dto.conversationId, userId: senderId } },
    });
    if (!member) throw new ForbiddenException('not a conversation member');

    // 2. idempotency: same clientMsgId already processed?
    const existing = await this.prisma.message.findUnique({
      where: { conversationId_clientMsgId: { conversationId: dto.conversationId, clientMsgId: dto.clientMsgId } },
    });
    if (existing) {
      return {
        ack: {
          id: existing.id,
          clientMsgId: existing.clientMsgId,
          seq: existing.seq,
          createdAt: existing.createdAt,
          rejected: false,
        },
        message: this.toView(existing),
      };
    }

    // 3. block check (private only): is sender blocked by the other member?
    const conv = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      include: { members: { select: { userId: true } } },
    });
    if (!conv) throw new NotFoundException('conversation not found');

    let rejected = false;
    if (conv.type === 'PRIVATE') {
      const other = conv.members.find((m) => m.userId !== senderId);
      if (other) {
        const block = await this.prisma.friendship.findUnique({
          where: { ownerId_friendId: { ownerId: other.userId, friendId: senderId } },
        });
        if (block?.isBlocked) rejected = true;
      }
    }

    // 4. allocate monotonic seq (atomic)
    const rows = await this.prisma.$queryRaw<Array<{ currentSeq: number }>>`
      UPDATE "Conversation"
      SET "currentSeq" = "currentSeq" + 1, "lastMessageAt" = NOW()
      WHERE id = ${dto.conversationId}
      RETURNING "currentSeq"`;
    const seq = rows[0].currentSeq;

    // 5. encrypt content
    const enc = this.crypto.encrypt(dto.content);
    const id = nanoid(12);
    const tsv = dto.type === MessageType.TEXT || dto.type === MessageType.EMOJI
      ? tokenizeForSearch(dto.content)
      : '';

    // 6. raw INSERT (writes content_tsv at insert time using the plaintext tokenization)
    const mentions = dto.mentions ?? [];
    await this.prisma.$executeRaw`
      INSERT INTO "Message"
        (id, "conversationId", "senderId", type, content, iv, "authTag", seq, "clientMsgId", "replyToId", mentions, content_tsv, "createdAt")
      VALUES
        (${id}, ${dto.conversationId}, ${senderId}, CAST(${dto.type} AS "MessageType"),
         ${enc.ciphertext}, ${enc.iv}, ${enc.authTag}, ${seq}, ${dto.clientMsgId},
         ${dto.replyToId ?? null}, ${mentions}::text[], to_tsvector('simple', ${tsv}), NOW())`;

    // 7. fetch normalized row
    const created = await this.prisma.message.findUniqueOrThrow({ where: { id } });
    const view = this.toView(created);

    // 8. distribute (skip delivery when sender is blocked by recipient)
    if (!rejected) {
      for (const m of conv.members) {
        // emit to every member's devices (incl. sender's other devices — front-end de-dups by clientMsgId)
        this.realtime.emitToUser(m.userId, 'message:new', view);
      }

      // 9. 通知被 @ 的成员（仅对该会话成员中的 @ 生效）
      const memberIds = new Set(conv.members.map((m) => m.userId));
      // '@所有人' 哨兵 '__all__' 展开为全体成员（去掉发送者）；存储列保留原始哨兵
      let resolved = mentions.filter((uid) => uid !== ALL_SENTINEL);
      if (mentions.includes(ALL_SENTINEL)) {
        resolved.push(...conv.members.filter((m) => m.userId !== senderId).map((m) => m.userId));
      }
      const targets = Array.from(new Set(resolved)).filter((uid) => memberIds.has(uid) && uid !== senderId);
      for (const targetId of targets) {
        this.events.emit('message.mentioned', {
          recipientId: targetId,
          actorId: senderId,
          type: 'MENTION',
          entityType: 'message',
          entityId: id,
          payload: { conversationId: dto.conversationId, seq, contentPreview: dto.type === MessageType.TEXT ? dto.content.slice(0, 60) : null },
        });
      }
    }

    return {
      ack: { id, clientMsgId: dto.clientMsgId, seq, createdAt: created.createdAt, rejected },
      message: view,
    };
  }

  async history(
    conversationId: string,
    userId: string,
    beforeSeq?: number,
    limit = 50,
  ): Promise<MessageView[]> {
    await this.assertMember(conversationId, userId);
    const msgs = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(beforeSeq ? { seq: { lt: beforeSeq } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: limit,
    });
    return msgs.map((m) => this.toView(m));
  }

  async search(conversationId: string, userId: string, q: string, limit = 30): Promise<MessageView[]> {
    await this.assertMember(conversationId, userId);
    const tokenized = tokenizeForSearch(q);
    if (!tokenized) return [];
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        conversationId: string;
        senderId: string;
        type: MessageType;
        content: string;
        iv: string;
        authTag: string;
        seq: number;
        clientMsgId: string;
        replyToId: string | null;
        mentions: string[];
        createdAt: Date;
        deletedAt: Date | null;
      }>
    >`
      SELECT id, "conversationId", "senderId", type, content, iv, "authTag",
             seq, "clientMsgId", "replyToId", mentions, "createdAt", "deletedAt"
      FROM "Message"
      WHERE "conversationId" = ${conversationId}
        AND content_tsv @@ plainto_tsquery('simple', ${tokenized})
        AND "deletedAt" IS NULL
      ORDER BY seq DESC
      LIMIT ${limit}`;
    return rows.map((r) => this.toView(r));
  }

  async recall(messageId: string, userId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('can only recall your own message');
    if (msg.deletedAt) throw new BadRequestException('already recalled');
    if (Date.now() - msg.createdAt.getTime() > RECALL_WINDOW_MS) {
      throw new BadRequestException('recall window (2 minutes) exceeded');
    }
    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: msg.conversationId },
      select: { userId: true },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'message:recall', {
        conversationId: msg.conversationId,
        id: messageId,
      });
    }
    return { ok: true };
  }

  private async assertMember(conversationId: string, userId: string) {
    const m = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!m) throw new ForbiddenException('not a conversation member');
    return m;
  }

  private toView(m: {
    id: string;
    conversationId: string;
    senderId: string;
    type: MessageType;
    content: string;
    iv: string;
    authTag: string;
    seq: number;
    clientMsgId: string;
    replyToId: string | null;
    mentions?: string[];
    createdAt: Date;
    deletedAt: Date | null;
  }): MessageView {
    let content = '';
    if (!m.deletedAt) {
      try {
        content = this.crypto.decrypt({ ciphertext: m.content, iv: m.iv, authTag: m.authTag });
      } catch {
        content = '';
      }
    }
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      type: m.type,
      content,
      seq: m.seq,
      clientMsgId: m.clientMsgId,
      replyToId: m.replyToId,
      mentions: m.mentions ?? [],
      createdAt: m.createdAt,
      deletedAt: m.deletedAt,
    };
  }
}
