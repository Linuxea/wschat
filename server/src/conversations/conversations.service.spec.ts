import { ForbiddenException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

// Both helpers are private; reach via `as any`.
function toPreview(svc: ConversationsService, msg: any) {
  return (svc as any).toPreview(msg);
}
async function remarkMap(svc: ConversationsService, userId: string) {
  return (svc as any).remarkMap(userId);
}

function baseMsg(over: Partial<any> = {}) {
  return {
    id: 'm1',
    type: 'TEXT',
    content: 'enc',
    iv: 'iv',
    authTag: 'tag',
    senderId: 'u1',
    seq: 1,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

describe('ConversationsService — pure / minimal-stub logic', () => {
  describe('toPreview', () => {
    function svcWithCrypto(crypto: any) {
      return new ConversationsService(null as any, crypto);
    }

    it('returns "消息已撤回" when deletedAt is set (overrides type)', () => {
      const svc = svcWithCrypto({ decrypt: jest.fn() });
      const r = toPreview(svc, baseMsg({ deletedAt: new Date(), type: 'TEXT' }));
      expect(r.preview).toBe('消息已撤回');
      // crypto.decrypt must NOT be called for recalled messages
      expect((svc as any).crypto.decrypt).not.toHaveBeenCalled();
    });

    it('decrypts TEXT content', () => {
      const decrypt = jest.fn().mockReturnValue('hello there');
      const svc = svcWithCrypto({ decrypt });
      expect(toPreview(svc, baseMsg({ type: 'TEXT' })).preview).toBe('hello there');
      expect(decrypt).toHaveBeenCalledWith({ ciphertext: 'enc', iv: 'iv', authTag: 'tag' });
    });

    it('decrypts EMOJI content', () => {
      const svc = svcWithCrypto({ decrypt: jest.fn().mockReturnValue('[笑哭]') });
      expect(toPreview(svc, baseMsg({ type: 'EMOJI' })).preview).toBe('[笑哭]');
    });

    it('returns "[无法解密]" when crypto.decrypt throws for TEXT', () => {
      const svc = svcWithCrypto({ decrypt: jest.fn(() => { throw new Error('bad'); }) });
      expect(toPreview(svc, baseMsg({ type: 'TEXT' })).preview).toBe('[无法解密]');
    });

    it.each([
      ['IMAGE', '[图片]'],
      ['VOICE', '[语音]'],
      ['VIDEO', '[视频]'],
      ['FILE', '[文件]'],
      ['SYSTEM', '[系统消息]'],
    ])('maps %s type to its preview token without calling crypto', (type, expected) => {
      const decrypt = jest.fn();
      const svc = svcWithCrypto({ decrypt });
      expect(toPreview(svc, baseMsg({ type })).preview).toBe(expected);
      expect(decrypt).not.toHaveBeenCalled();
    });

    it('falls back to "[消息]" for unknown types', () => {
      const svc = svcWithCrypto({ decrypt: jest.fn() });
      expect(toPreview(svc, baseMsg({ type: 'WHOOPS' })).preview).toBe('[消息]');
    });

    it('preserves id/type/senderId/seq/createdAt in the returned shape', () => {
      const svc = svcWithCrypto({ decrypt: jest.fn().mockReturnValue('p') });
      const r = toPreview(svc, baseMsg({ id: 'x9', type: 'TEXT', senderId: 's1', seq: 42 }));
      expect(r).toMatchObject({ id: 'x9', type: 'TEXT', senderId: 's1', seq: 42 });
      expect(r.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('remarkMap', () => {
    function svcWithPrisma(prisma: any) {
      return new ConversationsService(prisma, null as any);
    }

    it('builds Map<friendId, remark> skipping null remarks', async () => {
      const findMany = jest.fn().mockResolvedValue([
        { friendId: 'a', remark: '老王' },
        { friendId: 'b', remark: null },
        { friendId: 'c', remark: '小李' },
        { friendId: 'd', remark: '' }, // empty string is falsy -> skipped by `if (r.remark)`
      ]);
      const svc = svcWithPrisma({ friendship: { findMany } });
      const m = await remarkMap(svc, 'me');
      expect(m.get('a')).toBe('老王');
      expect(m.get('c')).toBe('小李');
      expect(m.has('b')).toBe(false);
      expect(m.has('d')).toBe(false);
      expect(m.size).toBe(2);
    });

    it('returns an empty map when no friendships', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const svc = svcWithPrisma({ friendship: { findMany } });
      const m = await remarkMap(svc, 'me');
      expect(m.size).toBe(0);
    });

    it('queries friendships owned by the user excluding null remarks', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const svc = svcWithPrisma({ friendship: { findMany } });
      await remarkMap(svc, 'me');
      expect(findMany).toHaveBeenCalledWith({
        where: { ownerId: 'me', NOT: { remark: null } },
        select: { friendId: true, remark: true },
      });
    });
  });

  describe('unread formula (Math.max(0, currentSeq - lastReadSeq))', () => {
    // The formula is inline in list()/findOne(); verify the clamp semantics in isolation.
    it.each([
      [10, 8, 2],
      [5, 5, 0],
      [3, 0, 3],
      [3, 100, 0], // clamped
    ])('currentSeq=%i, lastReadSeq=%i -> unread=%i', (currentSeq, lastReadSeq, expected) => {
      expect(Math.max(0, currentSeq - lastReadSeq)).toBe(expected);
    });
  });

  // ---- prisma-backed member-mutation methods ----

  describe('assertMember', () => {
    function mk(prisma: any) {
      return new ConversationsService(prisma, null as any);
    }

    it('returns the membership row when the user is a member', async () => {
      const row = { userId: 'u1', conversationId: 'c1', lastReadSeq: 3, isPinned: false, isMuted: false };
      const findUnique = jest.fn().mockResolvedValue(row);
      const svc = mk({ conversationMember: { findUnique, update: jest.fn() } });
      await expect(svc.assertMember('c1', 'u1')).resolves.toEqual(row);
      expect(findUnique).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'c1', userId: 'u1' } },
      });
    });

    it('throws ForbiddenException("not a conversation member") when not a member', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const svc = mk({ conversationMember: { findUnique, update: jest.fn() } });
      await expect(svc.assertMember('c1', 'ghost')).rejects.toThrow(ForbiddenException);
      await expect(svc.assertMember('c1', 'ghost')).rejects.toThrow('not a conversation member');
    });
  });

  describe('markRead', () => {
    function mk(prisma: any) {
      return new ConversationsService(prisma, null as any);
    }

    it('throws ForbiddenException when the caller is not a member', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const svc = mk({ conversationMember: { findUnique, update } });
      await expect(svc.markRead('c1', 'ghost', 5)).rejects.toThrow('not a conversation member');
      expect(update).not.toHaveBeenCalled();
    });

    it.each([
      ['negative clamped to 0', -5, 0],
      ['zero stays 0', 0, 0],
      ['positive passes through', 7, 7],
    ])('sets lastReadSeq via Math.max(0, seq): %s', async (_label, seq, expected) => {
      const findUnique = jest.fn().mockResolvedValue({ userId: 'u1', conversationId: 'c1' });
      const update = jest.fn().mockResolvedValue({ ok: true });
      const svc = mk({ conversationMember: { findUnique, update } });
      await svc.markRead('c1', 'u1', seq);
      expect(update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'c1', userId: 'u1' } },
        data: { lastReadSeq: { set: expected } },
      });
    });

    it('queries the compound key for the update', async () => {
      const findUnique = jest.fn().mockResolvedValue({ userId: 'u1', conversationId: 'c1' });
      const update = jest.fn().mockResolvedValue({ ok: true });
      const svc = mk({ conversationMember: { findUnique, update } });
      await svc.markRead('c1', 'u1', 4);
      expect(update.mock.calls[0][0].where).toEqual({
        conversationId_userId: { conversationId: 'c1', userId: 'u1' },
      });
    });

    it('returns the updated membership row', async () => {
      const findUnique = jest.fn().mockResolvedValue({ userId: 'u1', conversationId: 'c1' });
      const updated = { userId: 'u1', conversationId: 'c1', lastReadSeq: 9 };
      const update = jest.fn().mockResolvedValue(updated);
      const svc = mk({ conversationMember: { findUnique, update } });
      await expect(svc.markRead('c1', 'u1', 9)).resolves.toEqual(updated);
    });
  });

  describe('setPinned', () => {
    function mk(prisma: any) {
      return new ConversationsService(prisma, null as any);
    }

    it('throws ForbiddenException when not a member', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const svc = mk({ conversationMember: { findUnique, update } });
      await expect(svc.setPinned('c1', 'ghost', true)).rejects.toThrow('not a conversation member');
      expect(update).not.toHaveBeenCalled();
    });

    it('sets isPinned to the given boolean', async () => {
      const findUnique = jest.fn().mockResolvedValue({ userId: 'u1', conversationId: 'c1' });
      const update = jest.fn().mockResolvedValue({ ok: true });
      const svc = mk({ conversationMember: { findUnique, update } });
      await svc.setPinned('c1', 'u1', true);
      expect(update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'c1', userId: 'u1' } },
        data: { isPinned: true },
      });
    });
  });

  describe('setMuted', () => {
    function mk(prisma: any) {
      return new ConversationsService(prisma, null as any);
    }

    it('throws ForbiddenException when not a member', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const svc = mk({ conversationMember: { findUnique, update } });
      await expect(svc.setMuted('c1', 'ghost', false)).rejects.toThrow('not a conversation member');
      expect(update).not.toHaveBeenCalled();
    });

    it('sets isMuted to the given boolean', async () => {
      const findUnique = jest.fn().mockResolvedValue({ userId: 'u1', conversationId: 'c1' });
      const update = jest.fn().mockResolvedValue({ ok: true });
      const svc = mk({ conversationMember: { findUnique, update } });
      await svc.setMuted('c1', 'u1', false);
      expect(update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'c1', userId: 'u1' } },
        data: { isMuted: false },
      });
    });
  });
});
