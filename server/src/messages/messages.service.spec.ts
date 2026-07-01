import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { MessageType } from '@prisma/client';
import { MessagesService, ALL_SENTINEL } from './messages.service';
import {
  mockPrisma,
  mockCrypto,
  mockRealtime,
  mockEvents,
} from '../../test/helpers/prisma.mock';

function fakeMsg(over: Partial<any> = {}) {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    type: MessageType.TEXT,
    content: 'enc',
    iv: 'iv',
    authTag: 'tag',
    seq: 1,
    clientMsgId: 'cm1',
    replyToId: null,
    mentions: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

describe('MessagesService', () => {
  let svc: MessagesService;
  let prisma: any;
  let crypto: any;
  let realtime: any;
  let events: any;

  beforeEach(() => {
    prisma = mockPrisma();
    crypto = mockCrypto();
    realtime = mockRealtime();
    events = mockEvents();
    svc = new MessagesService(prisma, crypto, realtime, events);
  });

  // ---------------- send ----------------
  describe('send', () => {
    const dto = (over: Partial<any> = {}) => ({
      conversationId: 'c1',
      type: MessageType.TEXT,
      content: 'hello',
      clientMsgId: 'cm1',
      mentions: [],
      ...over,
    });

    it('throws ForbiddenException when sender is not a member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(svc.send('u1', dto())).rejects.toThrow('not a conversation member');
    });

    describe('idempotency', () => {
      it('returns existing ack without re-inserting when clientMsgId already exists', async () => {
        const existing = fakeMsg({ id: 'old', seq: 7, clientMsgId: 'cm1' });
        prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
        prisma.message.findUnique.mockResolvedValue(existing);

        const r = await svc.send('u1', dto());

        expect(r.ack).toMatchObject({ id: 'old', clientMsgId: 'cm1', seq: 7, rejected: false });
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(realtime.emitToUser).not.toHaveBeenCalled();
      });
    });

    describe('block check (PRIVATE only)', () => {
      beforeEach(() => {
        prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
        prisma.message.findUnique.mockResolvedValue(null); // not idempotent
        prisma.conversation.findUnique.mockResolvedValue({
          id: 'c1',
          type: 'PRIVATE',
          members: [{ userId: 'u1' }, { userId: 'u2' }],
        });
      });

      it('sets rejected=true when sender is blocked by the other member; message still stored', async () => {
        prisma.friendship.findUnique.mockResolvedValue({ isBlocked: true });
        prisma.$queryRaw.mockResolvedValue([{ currentSeq: 5 }]);
        prisma.message.findUniqueOrThrow.mockResolvedValue(fakeMsg({ seq: 5 }));

        const r = await svc.send('u1', dto());

        expect(r.ack.rejected).toBe(true);
        // message was still inserted
        expect(prisma.$executeRaw).toHaveBeenCalled();
        // but NO realtime/notifications emitted
        expect(realtime.emitToUser).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
      });

      it('sets rejected=false and distributes when not blocked', async () => {
        prisma.friendship.findUnique.mockResolvedValue({ isBlocked: false });
        prisma.$queryRaw.mockResolvedValue([{ currentSeq: 5 }]);
        prisma.message.findUniqueOrThrow.mockResolvedValue(fakeMsg({ seq: 5 }));

        const r = await svc.send('u1', dto());
        expect(r.ack.rejected).toBe(false);
        expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'message:new', expect.anything());
        expect(realtime.emitToUser).toHaveBeenCalledWith('u2', 'message:new', expect.anything());
      });
    });

    describe('tsv / tokenizeForSearch applied only for TEXT/EMOJI', () => {
      beforeEach(() => {
        prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
        prisma.message.findUnique.mockResolvedValue(null);
        prisma.conversation.findUnique.mockResolvedValue({
          id: 'c1', type: 'GROUP', members: [{ userId: 'u1' }],
        });
        prisma.$queryRaw.mockResolvedValue([{ currentSeq: 1 }]);
        prisma.message.findUniqueOrThrow.mockResolvedValue(fakeMsg());
      });

      it('passes tokenized content to $executeRaw for TEXT', async () => {
        await svc.send('u1', dto({ content: '你好world', type: MessageType.TEXT }));
        // tagged template: $executeRaw(strings[], ...interpolatedValues); the tsv value is tokenized
        const values = prisma.$executeRaw.mock.calls[0].slice(1);
        expect(values.some((v: any) => typeof v === 'string' && v.includes('你') && v.includes('好'))).toBe(true);
      });

      it('passes empty tsv for IMAGE', async () => {
        await svc.send('u1', dto({ content: 'x', type: MessageType.IMAGE }));
        const values = prisma.$executeRaw.mock.calls[0].slice(1);
        // to_tsvector('simple', '') -> the tsv interpolated value is ''
        expect(values).toContain('');
      });
    });

    describe('mentions resolution', () => {
      beforeEach(() => {
        prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
        prisma.message.findUnique.mockResolvedValue(null);
        prisma.conversation.findUnique.mockResolvedValue({
          id: 'c1', type: 'GROUP', members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }],
        });
        prisma.$queryRaw.mockResolvedValue([{ currentSeq: 1 }]);
        prisma.message.findUniqueOrThrow.mockResolvedValue(fakeMsg());
      });

      it("expands '__all__' to all members except sender, deduped", async () => {
        await svc.send('u1', dto({ mentions: [ALL_SENTINEL] }));
        const recipients = events.emit.mock.calls
          .filter((c: any[]) => c[0] === 'message.mentioned')
          .map((c: any[]) => c[1].recipientId);
        expect(recipients.sort()).toEqual(['u2', 'u3']);
      });

      it('dedups when __all__ overlaps with explicit mentions', async () => {
        await svc.send('u1', dto({ mentions: [ALL_SENTINEL, 'u2'] }));
        const recipients = events.emit.mock.calls
          .filter((c: any[]) => c[0] === 'message.mentioned')
          .map((c: any[]) => c[1].recipientId);
        expect(recipients.sort()).toEqual(['u2', 'u3']); // u2 only once
      });

      it('filters non-member mentions and excludes sender', async () => {
        await svc.send('u1', dto({ mentions: ['u2', 'uX'] })); // uX not a member
        const recipients = events.emit.mock.calls
          .filter((c: any[]) => c[0] === 'message.mentioned')
          .map((c: any[]) => c[1].recipientId);
        expect(recipients).toEqual(['u2']);
      });

      it('emits contentPreview = content.slice(0,60) for TEXT, null otherwise', async () => {
        const long = 'x'.repeat(100);
        await svc.send('u1', dto({ content: long, type: MessageType.TEXT, mentions: ['u2'] }));
        const mentionCall = events.emit.mock.calls.find((c: any[]) => c[0] === 'message.mentioned');
        expect(mentionCall[1].payload.contentPreview).toBe(long.slice(0, 60));

        events.emit.mockClear();
        await svc.send('u1', dto({ content: long, type: MessageType.IMAGE, mentions: ['u2'] }));
        const imgCall = events.emit.mock.calls.find((c: any[]) => c[0] === 'message.mentioned');
        expect(imgCall[1].payload.contentPreview).toBeNull();
      });

      it('emits message.mentioned with type MENTION and entityId = new message id', async () => {
        await svc.send('u1', dto({ mentions: ['u2'] }));
        const call = events.emit.mock.calls.find((c: any[]) => c[0] === 'message.mentioned');
        expect(call[1]).toMatchObject({
          recipientId: 'u2',
          actorId: 'u1',
          type: 'MENTION',
          entityType: 'message',
        });
        expect(call[1].entityId).toEqual(expect.any(String));
      });
    });

    it('throws NotFoundException when conversation vanished between checks', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.message.findUnique.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(svc.send('u1', dto())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------- recall ----------------
  describe('recall', () => {
    it('throws NotFoundException when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(svc.recall('mX', 'u1')).rejects.toThrow('message not found');
    });

    it('throws ForbiddenException when not the sender', async () => {
      prisma.message.findUnique.mockResolvedValue(fakeMsg({ senderId: 'u2' }));
      await expect(svc.recall('m1', 'u1')).rejects.toThrow('can only recall your own message');
    });

    it('throws BadRequestException when already recalled', async () => {
      prisma.message.findUnique.mockResolvedValue(
        fakeMsg({ senderId: 'u1', deletedAt: new Date() }),
      );
      await expect(svc.recall('m1', 'u1')).rejects.toThrow('already recalled');
    });

    it('throws "recall window (2 minutes) exceeded" after 120s', async () => {
      prisma.message.findUnique.mockResolvedValue(
        fakeMsg({ senderId: 'u1', createdAt: new Date(Date.now() - 121_000) }),
      );
      await expect(svc.recall('m1', 'u1')).rejects.toThrow('recall window (2 minutes) exceeded');
    });

    it('succeeds within the 2-minute window', async () => {
      prisma.message.findUnique.mockResolvedValue(
        fakeMsg({ senderId: 'u1', createdAt: new Date(Date.now() - 30_000) }),
      );
      prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      await expect(svc.recall('m1', 'u1')).resolves.toEqual({ ok: true });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'message:recall', expect.anything());
      expect(realtime.emitToUser).toHaveBeenCalledWith('u2', 'message:recall', expect.anything());
    });

    describe('2-minute boundary (exactly 120000ms vs 120001ms)', () => {
      let nowSpy: jest.SpyInstance;
      const FIXED = 1_000_000_000_000;

      beforeEach(() => {
        nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED);
      });
      afterEach(() => nowSpy.mockRestore());

      it('passes at exactly 120000ms (not > window)', async () => {
        prisma.message.findUnique.mockResolvedValue(
          fakeMsg({ senderId: 'u1', createdAt: new Date(FIXED - 120_000) }),
        );
        prisma.conversationMember.findMany.mockResolvedValue([]);
        await expect(svc.recall('m1', 'u1')).resolves.toEqual({ ok: true });
      });

      it('fails at exactly 120001ms (> window)', async () => {
        prisma.message.findUnique.mockResolvedValue(
          fakeMsg({ senderId: 'u1', createdAt: new Date(FIXED - 120_001) }),
        );
        await expect(svc.recall('m1', 'u1')).rejects.toThrow('recall window (2 minutes) exceeded');
      });
    });
  });

  // ---------------- search ----------------
  describe('search', () => {
    it('throws ForbiddenException when not a member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(svc.search('c1', 'u1', 'hi')).rejects.toThrow('not a conversation member');
    });

    it('returns [] without a DB call when tokenized query is empty', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      const r = await svc.search('c1', 'u1', '   ');
      expect(r).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('calls $queryRaw when tokenized query is non-empty', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.$queryRaw.mockResolvedValue([fakeMsg({ content: 'enc' })]);
      const r = await svc.search('c1', 'u1', '你好');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(r).toHaveLength(1);
      // toView decrypts
      expect(r[0].content).toBe('decrypted');
    });
  });

  // ---------------- history ----------------
  describe('history', () => {
    it('throws ForbiddenException when not a member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(svc.history('c1', 'u1')).rejects.toThrow('not a conversation member');
    });

    it('applies seq < beforeSeq filter when beforeSeq provided', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.message.findMany.mockResolvedValue([]);
      await svc.history('c1', 'u1', 100, 50);
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'c1', seq: { lt: 100 } },
          orderBy: { seq: 'desc' },
          take: 50,
        }),
      );
    });

    it('omits the seq filter when beforeSeq is absent', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.message.findMany.mockResolvedValue([]);
      await svc.history('c1', 'u1', undefined, 50);
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversationId: 'c1' }, take: 50 }),
      );
    });

    it('uses a default limit of 50', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.message.findMany.mockResolvedValue([]);
      await svc.history('c1', 'u1');
      expect(prisma.message.findMany.mock.calls[0][0].take).toBe(50);
    });
  });

  // ---------------- toView (private, exercised via decrypted/deleted shaping) ----------------
  describe('toView shaping', () => {
    it('returns content="" for a recalled (deletedAt set) message', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.message.findMany.mockResolvedValue([fakeMsg({ deletedAt: new Date() })]);
      const r = await svc.history('c1', 'u1');
      expect(r[0].content).toBe('');
      expect(crypto.decrypt).not.toHaveBeenCalled();
    });

    it('returns content="" when crypto.decrypt throws', async () => {
      crypto.decrypt.mockImplementation(() => { throw new Error('bad'); });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.message.findMany.mockResolvedValue([fakeMsg()]);
      const r = await svc.history('c1', 'u1');
      expect(r[0].content).toBe('');
    });
  });
});
