import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../common/realtime/realtime.service';
import { PUBLIC_USER_SELECT, PublicUser } from '../users/users.service';

export interface NotificationEvent {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
  payload?: Prisma.InputJsonValue;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  actor: PublicUser; //最新触发者（或聚合组里最新者）
  actors: PublicUser[]; //聚合时多人；非聚合为单元素
  actorCount: number; //聚合组总人数；非聚合为 1
  entityType: string;
  entityId: string;
  payload: Prisma.JsonValue | null;
  readAt: Date | null;
  createdAt: Date;
  aggregated: boolean;
}

export interface Badges {
  chat: number;
  contacts: number;
  moments: number;
}

const INTERACTION_TYPES: NotificationType[] = [
  NotificationType.MOMENT_LIKE,
  NotificationType.MOMENT_COMMENT,
  NotificationType.MOMENT_REPLY,
];

const NOTIFICATION_INCLUDE = {
  actor: { select: PUBLIC_USER_SELECT },
} satisfies Prisma.NotificationInclude;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---------------- 事件处理（由各领域 service emit 触发） ----------------

  @OnEvent('moment.liked')
  async onMomentLiked(e: NotificationEvent) {
    if (e.recipientId === e.actorId) return; //自己赞自己不发
    await this.createAndPush(e);
  }

  @OnEvent('moment.unliked')
  async onMomentUnliked(e: NotificationEvent) {
    // 取消点赞：删除该 (recipient, actor, moment) 的未读 MOMENT_LIKE 通知（已读的保留作历史）
    await this.prisma.notification.deleteMany({
      where: {
        recipientId: e.recipientId,
        actorId: e.actorId,
        type: NotificationType.MOMENT_LIKE,
        entityId: e.entityId,
        readAt: null,
      },
    });
    await this.pushBadge(e.recipientId);
  }

  @OnEvent('moment.commented')
  async onMomentCommented(e: NotificationEvent) {
    if (e.recipientId === e.actorId) return;
    await this.createAndPush(e);
  }

  @OnEvent('moment.replied')
  async onMomentReplied(e: NotificationEvent) {
    if (e.recipientId === e.actorId) return;
    await this.createAndPush(e);
  }

  @OnEvent('friend.requested')
  async onFriendRequested(e: NotificationEvent) {
    if (e.recipientId === e.actorId) return;
    await this.createAndPush(e);
  }

  @OnEvent('message.mentioned')
  async onMessageMentioned(e: NotificationEvent) {
    if (e.recipientId === e.actorId) return;
    await this.createAndPush(e);
  }

  @OnEvent('call.missed')
  async onCallMissed(e: NotificationEvent) {
    if (e.recipientId === e.actorId) return;
    await this.createAndPush(e);
  }

  // ---------------- 核心：落库 + 推送 ----------------

  private async createAndPush(e: NotificationEvent) {
    const row = await this.prisma.notification.create({
      data: {
        recipientId: e.recipientId,
        actorId: e.actorId,
        type: e.type,
        entityType: e.entityType,
        entityId: e.entityId,
        payload: e.payload ?? Prisma.JsonNull,
      },
      include: NOTIFICATION_INCLUDE,
    });
    const view = this.toSingleView(row);
    this.realtime.emitToUser(e.recipientId, 'notification:new', view);
    await this.pushBadge(e.recipientId);
  }

  private async pushBadge(recipientId: string) {
    const badges = await this.badges(recipientId);
    this.realtime.emitToUser(recipientId, 'notification:badge', badges);
  }

  // ---------------- 查询：badges 聚合（单一数据源） ----------------

  async badges(userId: string): Promise<Badges> {
    const [memberships, contacts, momentsGroups] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { userId },
        include: { conversation: { select: { currentSeq: true } } },
      }),
      this.prisma.friendRequest.count({
        where: { toId: userId, status: 'PENDING' },
      }),
      this.prisma.notification.findMany({
        where: { recipientId: userId, readAt: null, type: { in: INTERACTION_TYPES } },
        select: { type: true, entityId: true },
        distinct: ['type', 'entityId'],
      }),
    ]);

    const chat = memberships.reduce(
      (s, m) => s + Math.max(0, m.conversation.currentSeq - m.lastReadSeq),
      0,
    );

    return { chat, contacts, moments: momentsGroups.length };
  }

  // ---------------- 查询：通知列表（微信式聚合） ----------------

  async list(userId: string, before?: string, limit = 50): Promise<NotificationView[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        recipientId: userId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: NOTIFICATION_INCLUDE,
    });

    // 聚合：MOMENT_LIKE 按 (entityId) 合并 → 「X 等 N 人赞了你」
    // 其余类型各自独立
    const grouped = new Map<string, NotificationView>();
    const singles: NotificationView[] = [];

    for (const r of rows) {
      if (r.type === NotificationType.MOMENT_LIKE) {
        const key = `MOMENT_LIKE:${r.entityId}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.actors.push(r.actor);
          existing.actorCount += 1;
          if (r.createdAt > existing.createdAt) {
            existing.createdAt = r.createdAt;
            existing.actor = r.actor;
            existing.id = r.id;
            existing.readAt = existing.readAt && r.readAt ? existing.readAt : null;
          }
          // 任意一条未读则整组未读
          if (!r.readAt) existing.readAt = null;
          existing.aggregated = true;
        } else {
          const view = this.toSingleView(r);
          view.aggregated = false; //先标记为单条，聚合后由 count 判定
          grouped.set(key, view);
        }
      } else {
        singles.push(this.toSingleView(r));
      }
    }

    // 组装结果：聚合条目按 actorCount>1 → aggregated
    const aggregated: NotificationView[] = [];
    for (const v of grouped.values()) {
      v.aggregated = v.actorCount > 1;
      aggregated.push(v);
    }

    return [...aggregated, ...singles].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  // ---------------- 标记已读 ----------------

  async markRead(id: string, userId: string) {
    const row = await this.prisma.notification.updateMany({
      where: { id, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    await this.pushBadge(userId);
    return { ok: true, updated: row.count };
  }

  async markAllRead(userId: string, type?: string) {
    const types = this.resolveTypes(type);
    const r = await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        readAt: null,
        ...(types ? { type: { in: types } } : {}),
      },
      data: { readAt: new Date() },
    });
    await this.pushBadge(userId);
    return { ok: true, updated: r.count };
  }

  private resolveTypes(type?: string): NotificationType[] | null {
    if (!type) return null;
    if (type === 'moments') return INTERACTION_TYPES;
    if (type === 'contacts') return [NotificationType.FRIEND_REQUEST];
    return [type as NotificationType];
  }

  // ---------------- view shaping ----------------

  private toSingleView(
    r: Prisma.NotificationGetPayload<{ include: typeof NOTIFICATION_INCLUDE }>,
  ): NotificationView {
    return {
      id: r.id,
      type: r.type,
      actor: r.actor,
      actors: [r.actor],
      actorCount: 1,
      entityType: r.entityType,
      entityId: r.entityId,
      payload: r.payload,
      readAt: r.readAt,
      createdAt: r.createdAt,
      aggregated: false,
    };
  }
}
