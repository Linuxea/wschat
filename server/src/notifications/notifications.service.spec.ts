import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { mockPrisma } from '../../test/helpers/prisma.mock';

function actor(id: string) {
  return { id, username: id, nickname: id, avatar: null, bio: null };
}

// resolveTypes is private but pure; reach via `as any`.
function resolveTypes(svc: NotificationsService, type?: string) {
  return (svc as any).resolveTypes(type);
}

// full prisma stub + realtime stub; badges-related methods default to empty/zero
function fullSvc(prismaOverrides: Record<string, () => any> = {}) {
  const prisma = mockPrisma();
  prisma.notification.findMany.mockResolvedValue([]);
  prisma.conversationMember.findMany.mockResolvedValue([]);
  prisma.friendRequest.count.mockResolvedValue(0);
  for (const [key, impl] of Object.entries(prismaOverrides)) {
    (prisma.notification as any)[key] = jest.fn().mockImplementation(impl) ?? (prisma.notification as any)[key];
  }
  const realtime = { emitToUser: jest.fn() };
  return { prisma, svc: new NotificationsService(prisma, realtime as any) };
}

describe('NotificationsService — pure / minimal-stub logic', () => {
  describe('resolveTypes', () => {
    let svc: NotificationsService;
    beforeEach(() => {
      // constructor only stores deps; resolveTypes touches neither
      svc = new NotificationsService(null as any, null as any);
    });

    it('returns null for undefined', () => {
      expect(resolveTypes(svc, undefined)).toBeNull();
    });

    it('returns null for empty string... actually undefined only — empty string is truthy-ish', () => {
      // `if (!type) return null` — empty string is falsy, so returns null too
      expect(resolveTypes(svc, '')).toBeNull();
    });

    it("returns the 3 INTERACTION_TYPES for 'moments'", () => {
      expect(resolveTypes(svc, 'moments')).toEqual([
        NotificationType.MOMENT_LIKE,
        NotificationType.MOMENT_COMMENT,
        NotificationType.MOMENT_REPLY,
      ]);
    });

    it("returns [FRIEND_REQUEST] for 'contacts'", () => {
      expect(resolveTypes(svc, 'contacts')).toEqual([NotificationType.FRIEND_REQUEST]);
    });

    it('wraps an arbitrary type string into a single-element array', () => {
      expect(resolveTypes(svc, 'MENTION')).toEqual(['MENTION']);
      expect(resolveTypes(svc, NotificationType.MISSED_CALL)).toEqual(['MISSED_CALL']);
    });
  });

  describe('badges — unread aggregation formula', () => {
    function makeSvc(prisma: any) {
      return new NotificationsService(prisma, null as any);
    }

    function stub(prisma: any, over: Partial<{
      memberships: any[];
      contacts: number;
      momentGroups: any[];
    }>) {
      prisma.conversationMember.findMany.mockResolvedValue(over.memberships ?? []);
      prisma.friendRequest.count.mockResolvedValue(over.contacts ?? 0);
      prisma.notification.findMany.mockResolvedValue(over.momentGroups ?? []);
    }

    function prismaStub() {
      return {
        conversationMember: { findMany: jest.fn() },
        friendRequest: { count: jest.fn() },
        notification: { findMany: jest.fn() },
      };
    }

    it('chat = sum of max(0, currentSeq - lastReadSeq) across memberships', async () => {
      const p = prismaStub();
      const svc = makeSvc(p);
      stub(p, {
        memberships: [
          { lastReadSeq: 8, conversation: { currentSeq: 10 } }, // +2
          { lastReadSeq: 5, conversation: { currentSeq: 5 } }, // +0
          { lastReadSeq: 0, conversation: { currentSeq: 3 } }, // +3
        ],
        contacts: 2,
        momentGroups: [{ type: 'x', entityId: 'y' }],
      });
      await expect(svc.badges('u1')).resolves.toEqual({ chat: 5, contacts: 2, moments: 1 });
    });

    it('clamps negative unread (lastReadSeq > currentSeq) to 0', async () => {
      const p = prismaStub();
      const svc = makeSvc(p);
      stub(p, {
        memberships: [
          { lastReadSeq: 100, conversation: { currentSeq: 3 } }, // would be -97 -> 0
          { lastReadSeq: 2, conversation: { currentSeq: 5 } }, // +3
        ],
      });
      await expect(svc.badges('u1')).resolves.toEqual({ chat: 3, contacts: 0, moments: 0 });
    });

    it('returns zeros for a user with no memberships/contacts/notifications', async () => {
      const p = prismaStub();
      const svc = makeSvc(p);
      stub(p, {});
      await expect(svc.badges('u1')).resolves.toEqual({ chat: 0, contacts: 0, moments: 0 });
    });

    it('moments = count of distinct (type, entityId) groups (not raw rows)', async () => {
      const p = prismaStub();
      const svc = makeSvc(p);
      // prisma `distinct: ['type','entityId']` already dedupes; service just counts rows
      stub(p, {
        momentGroups: [
          { type: 'MOMENT_LIKE', entityId: 'm1' },
          { type: 'MOMENT_COMMENT', entityId: 'm2' },
          { type: 'MOMENT_REPLY', entityId: 'm3' },
        ],
      });
      await expect(svc.badges('u1')).resolves.toMatchObject({ moments: 3 });
    });

    it('queries moment notifications filtered to INTERACTION_TYPES and unread only', async () => {
      const p = prismaStub();
      const svc = makeSvc(p);
      stub(p, {});
      await svc.badges('u1');
      expect(p.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipientId: 'u1',
            readAt: null,
            type: { in: [
              NotificationType.MOMENT_LIKE,
              NotificationType.MOMENT_COMMENT,
              NotificationType.MOMENT_REPLY,
            ] },
          }),
          distinct: ['type', 'entityId'],
        }),
      );
    });

    it('queries pending friend requests for contacts', async () => {
      const p = prismaStub();
      const svc = makeSvc(p);
      stub(p, {});
      await svc.badges('u1');
      expect(p.friendRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { toId: 'u1', status: 'PENDING' } }),
      );
    });
  });
});

describe('NotificationsService.list — MOMENT_LIKE aggregation', () => {
  function likeRow(entityId: string, actorId: string, createdAt: Date, readAt: Date | null, id = `n_${actorId}_${entityId}`) {
    return {
      id,
      type: NotificationType.MOMENT_LIKE,
      actor: actor(actorId),
      entityType: 'moment',
      entityId,
      payload: null,
      readAt,
      createdAt,
    };
  }
  function otherRow(type: NotificationType, entityId: string, actorId: string, createdAt: Date, id = `n_${type}_${actorId}`) {
    return {
      id,
      type,
      actor: actor(actorId),
      entityType: 'moment',
      entityId,
      payload: null,
      readAt: null,
      createdAt,
    };
  }
  function svcWith(rows: any[]) {
    const prisma = {
      notification: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    return new NotificationsService(prisma as any, null as any);
  }

  it('single like → aggregated:false, actorCount:1', async () => {
    const svc = svcWith([likeRow('m1', 'u2', new Date(1))]);
    const r = await svc.list('me');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ aggregated: false, actorCount: 1, entityId: 'm1' });
    expect(r[0].actors).toEqual([actor('u2')]);
  });

  it('multiple likes on the same entityId → aggregated:true, actorCount=N, latest actor/id/createdAt', async () => {
    const t1 = new Date(1);
    const t2 = new Date(2);
    const t3 = new Date(3);
    const svc = svcWith([
      likeRow('m1', 'u2', t1),
      likeRow('m1', 'u3', t2),
      likeRow('m1', 'u4', t3),
    ]);
    const r = await svc.list('me');
    expect(r).toHaveLength(1);
    const group = r[0];
    expect(group.aggregated).toBe(true);
    expect(group.actorCount).toBe(3);
    expect(group.actor).toEqual(actor('u4')); // latest
    expect(group.id).toBe('n_u4_m1'); // latest id
    expect(group.createdAt).toBe(t3); // latest createdAt
    expect(group.actors.map((a: any) => a.id).sort()).toEqual(['u2', 'u3', 'u4']);
  });

  it('likes on different entityIds → separate groups', async () => {
    const svc = svcWith([
      likeRow('m1', 'u2', new Date(1)),
      likeRow('m2', 'u3', new Date(2)),
    ]);
    const r = await svc.list('me');
    expect(r).toHaveLength(2);
    expect(r.map((v) => v.entityId).sort()).toEqual(['m1', 'm2']);
    expect(r.every((v) => v.aggregated === false)).toBe(true);
  });

  it('any-unread → group readAt:null; all-read → readAt preserved', async () => {
    const readDate = new Date(10);
    // group A: one unread among three -> readAt null
    const svcA = svcWith([
      likeRow('m1', 'u2', new Date(1), readDate),
      likeRow('m1', 'u3', new Date(2), readDate),
      likeRow('m1', 'u4', new Date(3), null), // unread
    ]);
    const rA = await svcA.list('me');
    expect(rA[0].readAt).toBeNull();

    // group B: all read -> readAt kept (the existing one, when newest is also read)
    const svcB = svcWith([
      likeRow('m1', 'u2', new Date(1), readDate),
      likeRow('m1', 'u3', new Date(2), readDate), // newer and read
    ]);
    const rB = await svcB.list('me');
    expect(rB[0].readAt).toEqual(readDate);
  });

  it('a newer-unread row appearing later still forces the group unread', async () => {
    const readDate = new Date(10);
    const svc = svcWith([
      likeRow('m1', 'u2', new Date(5), readDate), // older, read
      likeRow('m1', 'u3', new Date(2), null), // even older, unread
    ]);
    const r = await svc.list('me');
    expect(r[0].readAt).toBeNull();
  });

  it('keeps the newest createdAt/actor/id even when rows arrive out of order', async () => {
    const t1 = new Date(1);
    const t3 = new Date(3);
    const svc = svcWith([
      likeRow('m1', 'u_late', t3), // newer first
      likeRow('m1', 'u_early', t1), // older second
    ]);
    const r = await svc.list('me');
    expect(r[0].actor).toEqual(actor('u_late'));
    expect(r[0].createdAt).toBe(t3);
    expect(r[0].id).toBe('n_u_late_m1');
    expect(r[0].actorCount).toBe(2);
  });

  it('non-MOMENT_LIKE notifications go to singles (not aggregated)', async () => {
    const svc = svcWith([
      otherRow(NotificationType.MOMENT_COMMENT, 'm1', 'u2', new Date(1)),
      otherRow(NotificationType.MOMENT_COMMENT, 'm1', 'u3', new Date(2)), // same entityId, diff type
    ]);
    const r = await svc.list('me');
    expect(r).toHaveLength(2);
    expect(r.every((v) => v.aggregated === false && v.actorCount === 1)).toBe(true);
  });

  it('returns aggregated + singles sorted newest-first by createdAt', async () => {
    const t1 = new Date(1);
    const t2 = new Date(2);
    const t3 = new Date(3);
    const svc = svcWith([
      otherRow(NotificationType.FRIEND_REQUEST, 'fr1', 'u2', t1),
      likeRow('m1', 'u3', t2),
      otherRow(NotificationType.MOMENT_COMMENT, 'm2', 'u4', t3),
    ]);
    const r = await svc.list('me');
    expect(r.map((v) => v.createdAt)).toEqual([t3, t2, t1]);
  });

  it('passes the before cursor and limit to prisma', async () => {
    const prisma = { notification: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new NotificationsService(prisma as any, null as any);
    await svc.list('me', '2025-01-01T00:00:00Z', 30);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: 'me', createdAt: { lt: new Date('2025-01-01T00:00:00Z') } },
        take: 30,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('omits the createdAt filter when no before cursor', async () => {
    const prisma = { notification: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new NotificationsService(prisma as any, null as any);
    await svc.list('me');
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ recipientId: 'me' });
  });
});

describe('NotificationsService @OnEvent handlers — self-skip', () => {
  it.each([
    ['onMomentLiked', 'moment.liked'],
    ['onMomentCommented', 'moment.commented'],
    ['onMomentReplied', 'moment.replied'],
    ['onFriendRequested', 'friend.requested'],
    ['onMessageMentioned', 'message.mentioned'],
    ['onCallMissed', 'call.missed'],
  ])('%s skips when recipientId === actorId (no notification created)', async (method, _event) => {
    const { prisma, svc } = fullSvc();
    const evt = { recipientId: 'me', actorId: 'me', type: 'X', entityType: 'e', entityId: 'x' } as any;
    await (svc as any)[method](evt);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('onMomentLiked creates a notification when actor !== recipient', async () => {
    const { prisma, svc } = fullSvc();
    prisma.notification.create.mockResolvedValue({
      id: 'n1', type: NotificationType.MOMENT_LIKE, actor: actor('u2'),
      entityType: 'moment', entityId: 'm1', payload: null, readAt: null, createdAt: new Date(1),
    });
    await svc.onMomentLiked({ recipientId: 'me', actorId: 'u2', type: NotificationType.MOMENT_LIKE, entityType: 'moment', entityId: 'm1' } as any);
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ recipientId: 'me', actorId: 'u2', type: NotificationType.MOMENT_LIKE, entityId: 'm1' }),
    }));
  });

  it('onMomentUnliked deletes only UNREAD MOMENT_LIKE rows for the (recipient,actor,entity)', async () => {
    const { prisma, svc } = fullSvc();
    prisma.notification.deleteMany.mockResolvedValue({ count: 1 });
    await svc.onMomentUnliked({ recipientId: 'me', actorId: 'u2', type: NotificationType.MOMENT_LIKE, entityType: 'moment', entityId: 'm1' } as any);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        recipientId: 'me',
        actorId: 'u2',
        type: NotificationType.MOMENT_LIKE,
        entityId: 'm1',
        readAt: null, // only unread
      },
    });
  });
});

describe('NotificationsService.markRead / markAllRead', () => {
  it('markRead updates only the matching unread notification for the recipient', async () => {
    const { prisma, svc } = fullSvc();
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const r = await svc.markRead('n1', 'me');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', recipientId: 'me', readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(r).toEqual({ ok: true, updated: 1 });
  });

  it('markAllRead with no type updates all unread for the recipient', async () => {
    const { prisma, svc } = fullSvc();
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });
    const r = await svc.markAllRead('me');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 'me', readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(r).toEqual({ ok: true, updated: 5 });
  });

  it("markAllRead with type='moments' scopes to INTERACTION_TYPES", async () => {
    const { prisma, svc } = fullSvc();
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    await svc.markAllRead('me', 'moments');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        recipientId: 'me',
        readAt: null,
        type: { in: [NotificationType.MOMENT_LIKE, NotificationType.MOMENT_COMMENT, NotificationType.MOMENT_REPLY] },
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it("markAllRead with type='contacts' scopes to [FRIEND_REQUEST]", async () => {
    const { prisma, svc } = fullSvc();
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    await svc.markAllRead('me', 'contacts');
    expect(prisma.notification.updateMany.mock.calls[0][0].where.type).toEqual({
      in: [NotificationType.FRIEND_REQUEST],
    });
  });
});
