import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MomentVisibility, Prisma } from '@prisma/client';
import { MomentsService } from './moments.service';
import {
  mockPrisma,
  mockCrypto,
  mockEvents,
} from '../../test/helpers/prisma.mock';

function momentRow(over: Partial<any> = {}) {
  return {
    id: 'm1',
    author: { id: 'a1', username: 'a', nickname: 'a', avatar: null, bio: null },
    content: 'enc',
    iv: 'iv',
    authTag: 'tag',
    media: null,
    visibility: MomentVisibility.PUBLIC,
    createdAt: new Date(1),
    likes: [],
    comments: [],
    ...over,
  };
}

describe('MomentsService', () => {
  let svc: MomentsService;
  let prisma: any;
  let crypto: any;
  let events: any;

  beforeEach(() => {
    prisma = mockPrisma();
    crypto = mockCrypto();
    events = mockEvents();
    svc = new MomentsService(prisma, crypto, events);
  });

  // ---------------- create ----------------
  describe('create', () => {
    const dto = (over: Partial<any> = {}) => ({
      content: 'hello',
      media: undefined,
      visibility: MomentVisibility.PUBLIC,
      specifiedIds: undefined,
      ...over,
    });

    it('encrypts content and stores ciphertext/iv/authTag (not plaintext)', async () => {
      prisma.moment.create.mockImplementation(({ data }: any) =>
        Promise.resolve(momentRow({ content: data.content, iv: data.iv, authTag: data.authTag })),
      );
      await svc.create('u1', dto());
      const data = prisma.moment.create.mock.calls[0][0].data;
      expect(data.content).toBe('c'); // mockCrypto.encrypt returns {ciphertext:'c',iv:'i',authTag:'a'}
      expect(data.iv).toBe('i');
      expect(data.authTag).toBe('a');
      expect(data.content).not.toBe('hello');
    });

    it('maps media items including width/height only when not null', async () => {
      prisma.moment.create.mockImplementation(({ data }: any) =>
        Promise.resolve(momentRow({ media: data.media })),
      );
      await svc.create('u1', dto({
        media: [
          { type: 'IMAGE', url: 'u1', width: 100, height: 200 },
          { type: 'VIDEO', url: 'u2', width: null, height: null },
        ],
      }));
      const media = prisma.moment.create.mock.calls[0][0].data.media;
      expect(media[0]).toEqual({ type: 'IMAGE', url: 'u1', width: 100, height: 200 });
      expect(media[1]).toEqual({ type: 'VIDEO', url: 'u2' }); // null width/height omitted
    });

    it('uses Prisma.JsonNull when no media provided', async () => {
      prisma.moment.create.mockResolvedValue(momentRow());
      await svc.create('u1', dto({ media: undefined }));
      expect(prisma.moment.create.mock.calls[0][0].data.media).toBe(Prisma.JsonNull);
    });

    it('defaults specifiedIds to [] when not provided', async () => {
      prisma.moment.create.mockResolvedValue(momentRow());
      await svc.create('u1', dto({ specifiedIds: undefined }));
      expect(prisma.moment.create.mock.calls[0][0].data.specifiedIds).toEqual([]);
    });

    it('toView decrypts content and returns likedByMe/likeCount/commentCount', async () => {
      prisma.moment.create.mockResolvedValue(
        momentRow({
          likes: [{ userId: 'u1' }, { userId: 'u2' }],
          comments: [{ id: 'c1', user: {}, content: 'hi', replyToUserId: null, createdAt: new Date(1) }],
        }),
      );
      const r = await svc.create('u1', dto());
      expect(r.content).toBe('decrypted'); // mockCrypto.decrypt returns 'decrypted'
      expect(r.likeCount).toBe(2);
      expect(r.likedByMe).toBe(true);
      expect(r.commentCount).toBe(1);
    });
  });

  // ---------------- feed ----------------
  describe('feed — visibility OR clauses', () => {
    it('builds OR: own + friends PUBLIC/FRIENDS/SPECIFIED(has userId)', async () => {
      prisma.friendship.findMany.mockResolvedValue([
        { friendId: 'f1' }, { friendId: 'f2' },
      ]);
      prisma.moment.findMany.mockResolvedValue([]);
      await svc.feed('u1');
      const where = prisma.moment.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { authorId: 'u1' },
        { authorId: { in: ['f1', 'f2'] }, visibility: MomentVisibility.PUBLIC },
        { authorId: { in: ['f1', 'f2'] }, visibility: MomentVisibility.FRIENDS },
        { authorId: { in: ['f1', 'f2'] }, visibility: MomentVisibility.SPECIFIED, specifiedIds: { has: 'u1' } },
      ]);
    });

    it('filters friends by momentsBlocked: false', async () => {
      prisma.friendship.findMany.mockResolvedValue([]);
      prisma.moment.findMany.mockResolvedValue([]);
      await svc.feed('u1');
      expect(prisma.friendship.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'u1', momentsBlocked: false },
        select: { friendId: true },
      });
    });

    it('applies the before cursor as createdAt < new Date(before)', async () => {
      prisma.friendship.findMany.mockResolvedValue([]);
      prisma.moment.findMany.mockResolvedValue([]);
      await svc.feed('u1', '2025-01-01T00:00:00Z', 20);
      expect(prisma.moment.findMany.mock.calls[0][0].where.createdAt).toEqual({
        lt: new Date('2025-01-01T00:00:00Z'),
      });
      expect(prisma.moment.findMany.mock.calls[0][0].take).toBe(20);
    });

    it('omits createdAt filter and defaults limit=30 when no before/limit', async () => {
      prisma.friendship.findMany.mockResolvedValue([]);
      prisma.moment.findMany.mockResolvedValue([]);
      await svc.feed('u1');
      expect(prisma.moment.findMany.mock.calls[0][0].where).not.toHaveProperty('createdAt');
      expect(prisma.moment.findMany.mock.calls[0][0].take).toBe(30);
    });
  });

  // ---------------- findByUser ----------------
  describe('findByUser — visibility branching', () => {
    it('isSelf: no visibility filter (sees all own moments)', async () => {
      prisma.moment.findMany.mockResolvedValue([]);
      await svc.findByUser('u1', 'u1');
      expect(prisma.friendship.findUnique).not.toHaveBeenCalled();
      expect(prisma.moment.findMany.mock.calls[0][0].where).toEqual({ authorId: 'u1' });
    });

    it('momentsBlocked: returns [] without querying moments', async () => {
      prisma.friendship.findUnique.mockResolvedValue({ momentsBlocked: true });
      const r = await svc.findByUser('u1', 'u2');
      expect(r).toEqual([]);
      expect(prisma.moment.findMany).not.toHaveBeenCalled();
    });

    it('non-friend: visibility PUBLIC + SPECIFIED(has userId)', async () => {
      prisma.friendship.findUnique.mockResolvedValue(null);
      prisma.moment.findMany.mockResolvedValue([]);
      await svc.findByUser('u1', 'u2');
      expect(prisma.moment.findMany.mock.calls[0][0].where.OR).toEqual([
        { visibility: MomentVisibility.PUBLIC },
        { visibility: MomentVisibility.SPECIFIED, specifiedIds: { has: 'u1' } },
      ]);
    });

    it('friend: adds FRIENDS visibility', async () => {
      prisma.friendship.findUnique.mockResolvedValue({ momentsBlocked: false });
      prisma.moment.findMany.mockResolvedValue([]);
      await svc.findByUser('u1', 'u2');
      expect(prisma.moment.findMany.mock.calls[0][0].where.OR).toEqual([
        { visibility: MomentVisibility.PUBLIC },
        { visibility: MomentVisibility.FRIENDS },
        { visibility: MomentVisibility.SPECIFIED, specifiedIds: { has: 'u1' } },
      ]);
    });
  });

  // ---------------- toggleLike ----------------
  describe('toggleLike', () => {
    it('throws NotFoundException when moment missing', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      await expect(svc.toggleLike('m1', 'u1')).rejects.toThrow('moment not found');
    });

    it('unlikes (delete + emit moment.unliked) when already liked', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', authorId: 'a1' });
      prisma.momentLike.findUnique.mockResolvedValue({ momentId: 'm1', userId: 'u1' });
      prisma.momentLike.delete.mockResolvedValue({});
      const r = await svc.toggleLike('m1', 'u1');
      expect(r).toEqual({ liked: false });
      expect(prisma.momentLike.delete).toHaveBeenCalledWith({
        where: { momentId_userId: { momentId: 'm1', userId: 'u1' } },
      });
      expect(events.emit).toHaveBeenCalledWith(
        'moment.unliked',
        expect.objectContaining({ recipientId: 'a1', actorId: 'u1', payload: { liked: false } }),
      );
    });

    it('likes (create + emit moment.liked) when not yet liked', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', authorId: 'a1' });
      prisma.momentLike.findUnique.mockResolvedValue(null);
      prisma.momentLike.create.mockResolvedValue({});
      const r = await svc.toggleLike('m1', 'u1');
      expect(r).toEqual({ liked: true });
      expect(prisma.momentLike.create).toHaveBeenCalledWith({ data: { momentId: 'm1', userId: 'u1' } });
      expect(events.emit).toHaveBeenCalledWith(
        'moment.liked',
        expect.objectContaining({ recipientId: 'a1', actorId: 'u1', payload: { liked: true } }),
      );
    });
  });

  // ---------------- comment ----------------
  describe('comment — notification guards', () => {
    beforeEach(() => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', authorId: 'a1' });
      prisma.momentComment.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'c1', user: {}, ...data }),
      );
    });

    it('throws NotFoundException when moment missing', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      await expect(svc.comment('m1', 'u1', { content: 'hi' } as any)).rejects.toThrow('moment not found');
    });

    it('emits moment.commented to the author when commenter !== author (no reply)', async () => {
      await svc.comment('m1', 'u1', { content: 'hi' } as any);
      expect(events.emit).toHaveBeenCalledWith(
        'moment.commented',
        expect.objectContaining({ recipientId: 'a1', actorId: 'u1' }),
      );
      expect(events.emit).not.toHaveBeenCalledWith('moment.replied', expect.anything());
    });

    it('does NOT emit moment.commented when commenting on own moment (self-comment)', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', authorId: 'u1' });
      await svc.comment('m1', 'u1', { content: 'hi' } as any);
      expect(events.emit).not.toHaveBeenCalledWith('moment.commented', expect.anything());
    });

    it('emits moment.replied when replying to a third party (not self, not author)', async () => {
      await svc.comment('m1', 'u1', { content: 'hi', replyToUserId: 'u3' } as any);
      expect(events.emit).toHaveBeenCalledWith(
        'moment.replied',
        expect.objectContaining({ recipientId: 'u3', actorId: 'u1', type: 'MOMENT_REPLY' }),
      );
      // and commented to author too
      expect(events.emit).toHaveBeenCalledWith('moment.commented', expect.anything());
    });

    it('does NOT emit moment.replied when replyTo is the author (author already gets commented)', async () => {
      await svc.comment('m1', 'u1', { content: 'hi', replyToUserId: 'a1' } as any);
      expect(events.emit).not.toHaveBeenCalledWith('moment.replied', expect.anything());
      expect(events.emit).toHaveBeenCalledWith('moment.commented', expect.anything());
    });

    it('does NOT emit moment.replied when replyTo is self', async () => {
      await svc.comment('m1', 'u1', { content: 'hi', replyToUserId: 'u1' } as any);
      expect(events.emit).not.toHaveBeenCalledWith('moment.replied', expect.anything());
    });

    it('emits only moment.replied (not commented) on self-comment with a third-party reply', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', authorId: 'u1' });
      await svc.comment('m1', 'u1', { content: 'hi', replyToUserId: 'u3' } as any);
      expect(events.emit).not.toHaveBeenCalledWith('moment.commented', expect.anything());
      expect(events.emit).toHaveBeenCalledWith('moment.replied', expect.anything());
    });
  });

  // ---------------- deleteComment ----------------
  describe('deleteComment', () => {
    it('throws NotFoundException when comment missing', async () => {
      prisma.momentComment.findUnique.mockResolvedValue(null);
      await expect(svc.deleteComment('c1', 'u1')).rejects.toThrow('comment not found');
    });

    it('throws ForbiddenException when not the comment author', async () => {
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', userId: 'u2' });
      await expect(svc.deleteComment('c1', 'u1')).rejects.toThrow('not your comment');
      expect(prisma.momentComment.delete).not.toHaveBeenCalled();
    });

    it('deletes when owned by the user', async () => {
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1' });
      prisma.momentComment.delete.mockResolvedValue({});
      await expect(svc.deleteComment('c1', 'u1')).resolves.toEqual({ ok: true });
    });
  });

  // ---------------- delete ----------------
  describe('delete', () => {
    it('throws NotFoundException when moment missing', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      await expect(svc.delete('m1', 'u1')).rejects.toThrow('moment not found');
    });

    it('throws ForbiddenException when not the moment author', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', authorId: 'u2' });
      await expect(svc.delete('m1', 'u1')).rejects.toThrow('not your moment');
      expect(prisma.moment.delete).not.toHaveBeenCalled();
    });

    it('deletes when owned by the user', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', authorId: 'u1' });
      prisma.moment.delete.mockResolvedValue({});
      await expect(svc.delete('m1', 'u1')).resolves.toEqual({ ok: true });
    });
  });

  // ---------------- toView (decrypt failure) ----------------
  describe('toView — decrypt failure', () => {
    it('returns content="" when crypto.decrypt throws', async () => {
      crypto.decrypt.mockImplementation(() => { throw new Error('bad'); });
      prisma.moment.findUnique.mockResolvedValue(momentRow());
      const r = await svc.findOne('m1', 'u1');
      expect(r.content).toBe('');
    });

    it('likedByMe = likes.some(l => l.userId === meId)', async () => {
      prisma.moment.findUnique.mockResolvedValue(
        momentRow({ likes: [{ userId: 'u2' }, { userId: 'u3' }] }),
      );
      const r = await svc.findOne('m1', 'u1');
      expect(r.likedByMe).toBe(false);
      prisma.moment.findUnique.mockResolvedValue(
        momentRow({ likes: [{ userId: 'u1' }, { userId: 'u3' }] }),
      );
      const r2 = await svc.findOne('m1', 'u1');
      expect(r2.likedByMe).toBe(true);
    });
  });
});
