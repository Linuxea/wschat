import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { FriendRequestStatus } from '@prisma/client';
import { FriendsService } from './friends.service';
import { mockPrisma, mockEvents } from '../../test/helpers/prisma.mock';

function mockNotifications() {
  return { markAllRead: jest.fn().mockResolvedValue({ ok: true, updated: 0 }) };
}

describe('FriendsService', () => {
  let svc: FriendsService;
  let prisma: any;
  let events: any;
  let notifications: any;

  beforeEach(() => {
    prisma = mockPrisma();
    events = mockEvents();
    notifications = mockNotifications();
    svc = new FriendsService(prisma, events, notifications);
  });

  // ---------------- sendRequest ----------------
  describe('sendRequest', () => {
    const dto = { toId: 'u2', message: 'hi' };

    it('throws BadRequestException when adding yourself', async () => {
      await expect(svc.sendRequest('u1', { toId: 'u1', message: 'hi' })).rejects.toThrow(
        'cannot add yourself',
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when target user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.sendRequest('u1', dto)).rejects.toThrow('target user not found');
    });

    it('throws ConflictException when already friends', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.friendship.findUnique.mockResolvedValue({ isBlocked: false });
      await expect(svc.sendRequest('u1', dto)).rejects.toThrow('already friends');
    });

    it('throws ConflictException when a pending request exists in EITHER direction', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.friendship.findUnique.mockResolvedValue(null); // not friends
      prisma.friendRequest.findFirst.mockResolvedValue({ id: 'fr' });
      await expect(svc.sendRequest('u1', dto)).rejects.toThrow('a pending request already exists');
      // assert the OR clause covers both directions
      const arg = prisma.friendRequest.findFirst.mock.calls[0][0];
      expect(arg.where.OR).toEqual([
        { fromId: 'u1', toId: 'u2' },
        { fromId: 'u2', toId: 'u1' },
      ]);
    });

    it('throws BadRequestException when blocked by target', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      // first findUnique (friendship) returns null (not friends); second (blockedByTarget) returns isBlocked
      prisma.friendship.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ isBlocked: true });
      prisma.friendRequest.findFirst.mockResolvedValue(null);
      await expect(svc.sendRequest('u1', dto)).rejects.toThrow(
        'cannot send request to this user',
      );
    });

    it('creates the request and emits friend.requested on success', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.friendship.findUnique.mockResolvedValue(null);
      prisma.friendRequest.findFirst.mockResolvedValue(null);
      prisma.friendRequest.create.mockResolvedValue({ id: 'fr1' });

      const r = await svc.sendRequest('u1', dto);
      expect(r).toEqual({ id: 'fr1' });
      expect(prisma.friendRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { fromId: 'u1', toId: 'u2', message: 'hi' } }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'friend.requested',
        expect.objectContaining({
          recipientId: 'u2',
          actorId: 'u1',
          type: 'FRIEND_REQUEST',
          entityType: 'friend_request',
          entityId: 'fr1',
          payload: { message: 'hi' },
        }),
      );
    });

    it('passes payload.message = null when no message provided', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.friendship.findUnique.mockResolvedValue(null);
      prisma.friendRequest.findFirst.mockResolvedValue(null);
      prisma.friendRequest.create.mockResolvedValue({ id: 'fr1' });
      await svc.sendRequest('u1', { toId: 'u2', message: undefined as any });
      const evt = events.emit.mock.calls[0][1];
      expect(evt.payload).toEqual({ message: null });
    });
  });

  // ---------------- acceptRequest ----------------
  describe('acceptRequest', () => {
    it('throws NotFoundException when request missing', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue(null);
      await expect(svc.acceptRequest('u1', 'fr1')).rejects.toThrow('request not found');
    });

    it('throws BadRequestException when not the recipient', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'fr1', toId: 'u2', fromId: 'u3', status: FriendRequestStatus.PENDING,
      });
      await expect(svc.acceptRequest('u1', 'fr1')).rejects.toThrow('not your request');
    });

    it('throws BadRequestException when request already handled', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'fr1', toId: 'u1', fromId: 'u2', status: FriendRequestStatus.ACCEPTED,
      });
      await expect(svc.acceptRequest('u1', 'fr1')).rejects.toThrow('request already handled');
    });

    it('runs a transaction: updates request, bidirectional upserts, ensures private conv, then markAllRead(contacts)', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'fr1', toId: 'u1', fromId: 'u2', status: FriendRequestStatus.PENDING,
      });
      prisma.conversation.findFirst.mockResolvedValue(null); // no existing private conv -> create
      prisma.conversation.create.mockResolvedValue({ id: 'c1' });

      const r = await svc.acceptRequest('u1', 'fr1');
      expect(r).toEqual({ ok: true });

      // transaction was used
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // request updated to ACCEPTED
      expect(prisma.friendRequest.update).toHaveBeenCalledWith({
        where: { id: 'fr1' },
        data: { status: FriendRequestStatus.ACCEPTED },
      });
      // bidirectional friendship upserts
      expect(prisma.friendship.upsert).toHaveBeenCalledTimes(2);
      const upsertArgs = prisma.friendship.upsert.mock.calls.map((c: any[]) => c[0].where);
      expect(upsertArgs).toContainEqual({ ownerId_friendId: { ownerId: 'u2', friendId: 'u1' } });
      expect(upsertArgs).toContainEqual({ ownerId_friendId: { ownerId: 'u1', friendId: 'u2' } });
      // private conversation ensured
      expect(prisma.conversation.findFirst).toHaveBeenCalled();
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { type: 'PRIVATE', members: { create: [{ userId: 'u2' }, { userId: 'u1' }] } } }),
      );
      // contacts badge cleared for the accepter
      expect(notifications.markAllRead).toHaveBeenCalledWith('u1', 'contacts');
    });

    it('does not create a private conversation when one already exists', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'fr1', toId: 'u1', fromId: 'u2', status: FriendRequestStatus.PENDING,
      });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'existing-c' });
      await svc.acceptRequest('u1', 'fr1');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });
  });

  // ---------------- rejectRequest ----------------
  describe('rejectRequest', () => {
    it('sets status to REJECTED and clears contacts badge', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue({
        id: 'fr1', toId: 'u1', fromId: 'u2', status: FriendRequestStatus.PENDING,
      });
      await svc.rejectRequest('u1', 'fr1');
      expect(prisma.friendRequest.update).toHaveBeenCalledWith({
        where: { id: 'fr1' },
        data: { status: FriendRequestStatus.REJECTED },
      });
      expect(notifications.markAllRead).toHaveBeenCalledWith('u1', 'contacts');
    });

    it('reuses the same 3 guards as acceptRequest', async () => {
      prisma.friendRequest.findUnique.mockResolvedValue(null);
      await expect(svc.rejectRequest('u1', 'fr1')).rejects.toThrow('request not found');
      prisma.friendRequest.findUnique.mockResolvedValue({ toId: 'u2', status: FriendRequestStatus.PENDING });
      await expect(svc.rejectRequest('u1', 'fr1')).rejects.toThrow('not your request');
      prisma.friendRequest.findUnique.mockResolvedValue({ toId: 'u1', status: FriendRequestStatus.REJECTED });
      await expect(svc.rejectRequest('u1', 'fr1')).rejects.toThrow('request already handled');
    });
  });

  // ---------------- tags ----------------
  describe('createTag', () => {
    it('creates the tag on success', async () => {
      prisma.tag.create.mockResolvedValue({ id: 't1', name: 'work' });
      const r = await svc.createTag('u1', { name: 'work' });
      expect(r).toEqual({ id: 't1', name: 'work' });
      expect(prisma.tag.create).toHaveBeenCalledWith({ data: { ownerId: 'u1', name: 'work' } });
    });

    it('maps Prisma P2002 to ConflictException("tag name already exists")', async () => {
      prisma.tag.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(svc.createTag('u1', { name: 'work' })).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.createTag('u1', { name: 'work' })).rejects.toThrow('tag name already exists');
    });

    it('rethrows non-P2002 errors unchanged', async () => {
      const err = Object.assign(new Error('boom'), { code: 'P2025' });
      prisma.tag.create.mockRejectedValue(err);
      await expect(svc.createTag('u1', { name: 'work' })).rejects.toBe(err);
    });
  });

  describe('deleteTag', () => {
    it('throws NotFoundException when tag missing', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      await expect(svc.deleteTag('u1', 't1')).rejects.toThrow('tag not found');
    });

    it('throws NotFoundException when tag belongs to another user (ownership check)', async () => {
      prisma.tag.findUnique.mockResolvedValue({ id: 't1', ownerId: 'u2' });
      await expect(svc.deleteTag('u1', 't1')).rejects.toThrow('tag not found');
      expect(prisma.tag.delete).not.toHaveBeenCalled();
    });

    it('deletes the tag when owned by the user', async () => {
      prisma.tag.findUnique.mockResolvedValue({ id: 't1', ownerId: 'u1' });
      prisma.tag.delete.mockResolvedValue({ id: 't1' });
      await expect(svc.deleteTag('u1', 't1')).resolves.toEqual({ ok: true });
      expect(prisma.tag.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });
  });

  describe('setFriendTags — full-replace semantics', () => {
    it('throws NotFoundException when friendship not owned', async () => {
      prisma.friendship.findUnique.mockResolvedValue(null);
      await expect(svc.setFriendTags('u1', 'u2', { tagIds: ['t1'] })).rejects.toThrow(
        'friendship not found',
      );
    });

    it('deletes all existing friendTags then creates the new set (transaction array)', async () => {
      prisma.friendship.findUnique.mockResolvedValue({ id: 'fs1' });
      const r = await svc.setFriendTags('u1', 'u2', { tagIds: ['t1', 't2'] });
      expect(r).toEqual({ ok: true });
      expect(prisma.friendTag.deleteMany).toHaveBeenCalledWith({ where: { friendshipId: 'fs1' } });
      expect(prisma.friendTag.create).toHaveBeenCalledTimes(2);
      expect(prisma.friendTag.create).toHaveBeenCalledWith({ data: { friendshipId: 'fs1', tagId: 't1' } });
      expect(prisma.friendTag.create).toHaveBeenCalledWith({ data: { friendshipId: 'fs1', tagId: 't2' } });
      // array-form transaction
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  // ---------------- ownership helper ----------------
  describe('getOwnedFriendshipOrThrow (via updateRemark)', () => {
    it('throws NotFoundException when friendship not found', async () => {
      prisma.friendship.findUnique.mockResolvedValue(null);
      await expect(svc.updateRemark('u1', 'u2', { remark: 'x' })).rejects.toThrow(
        'friendship not found',
      );
    });
  });
});
