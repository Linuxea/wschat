import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { GroupsService } from './groups.service';
import { mockPrisma, mockRealtime } from '../../test/helpers/prisma.mock';

describe('GroupsService', () => {
  let svc: GroupsService;
  let prisma: any;
  let realtime: any;

  beforeEach(() => {
    prisma = mockPrisma();
    realtime = mockRealtime();
    svc = new GroupsService(prisma, realtime);
  });

  // ---------------- create ----------------
  describe('create', () => {
    it('dedups memberIds and auto-includes the owner', async () => {
      prisma.conversation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'c1',
          members: data.members.create.map((m: any) => ({ userId: m.userId, role: m.role })),
        }),
      );
      await svc.create('owner', { name: 'g', memberIds: ['a', 'b', 'a', 'owner'] } as any);
      const createArg = prisma.conversation.create.mock.calls[0][0].data;
      const ids = createArg.members.create.map((m: any) => m.userId);
      expect(ids).toEqual(expect.arrayContaining(['owner', 'a', 'b']));
      expect(ids.length).toBe(3); // deduped
      expect(new Set(ids).size).toBe(3);
    });

    it('assigns OWNER role to the creator and MEMBER to others', async () => {
      prisma.conversation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'c1', members: data.members.create }),
      );
      await svc.create('owner', { name: 'g', memberIds: ['a'] } as any);
      const members = prisma.conversation.create.mock.calls[0][0].data.members.create;
      const owner = members.find((m: any) => m.userId === 'owner');
      const other = members.find((m: any) => m.userId === 'a');
      expect(owner.role).toBe(MemberRole.OWNER);
      expect(other.role).toBe(MemberRole.MEMBER);
    });

    it('emits conversation:new to non-owner members only', async () => {
      prisma.conversation.create.mockResolvedValue({
        id: 'c1',
        members: [{ userId: 'owner' }, { userId: 'a' }, { userId: 'b' }],
      });
      await svc.create('owner', { name: 'g', memberIds: ['a', 'b'] } as any);
      const recipients = realtime.emitToUser.mock.calls.map((c: any[]) => c[0]);
      expect(recipients).toEqual(expect.arrayContaining(['a', 'b']));
      expect(recipients).not.toContain('owner');
      expect(realtime.emitToUser).toHaveBeenCalledWith('a', 'conversation:new', { conversationId: 'c1' });
    });
  });

  // ---------------- invite ----------------
  describe('invite', () => {
    it('throws BadRequestException when all invitees are already members', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'caller', role: MemberRole.OWNER });
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'a' }, { userId: 'b' },
      ]);
      await expect(
        svc.invite('c1', 'caller', { userIds: ['a', 'b'] } as any),
      ).rejects.toThrow('all users already members');
    });

    it('adds only non-existing members and emits to each added', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'caller', role: MemberRole.OWNER });
      prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'a' }]);
      prisma.conversationMember.createMany.mockResolvedValue({ count: 2 });

      const r = await svc.invite('c1', 'caller', { userIds: ['a', 'b', 'c'] } as any);
      expect(r).toEqual({ added: 2 });
      expect(prisma.conversationMember.createMany).toHaveBeenCalledWith({
        data: [
          { conversationId: 'c1', userId: 'b', role: MemberRole.MEMBER },
          { conversationId: 'c1', userId: 'c', role: MemberRole.MEMBER },
        ],
      });
      const recipients = realtime.emitToUser.mock.calls.map((c: any[]) => c[0]);
      expect(recipients).toEqual(expect.arrayContaining(['b', 'c']));
      expect(recipients).not.toContain('a');
    });

    it('requires privileged role (assertPrivileged)', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'caller', role: MemberRole.MEMBER });
      await expect(
        svc.invite('c1', 'caller', { userIds: ['a'] } as any),
      ).rejects.toThrow('only owner / admin can do this');
    });
  });

  // ---------------- kick ----------------
  describe('kick', () => {
    it('throws NotFoundException when target member not found', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'caller', role: MemberRole.OWNER });
      // second findUnique (target) returns null
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ userId: 'caller', role: MemberRole.OWNER })
        .mockResolvedValueOnce(null);
      await expect(svc.kick('c1', 'caller', 'target')).rejects.toThrow('member not found');
    });

    it('throws BadRequestException when target is the OWNER', async () => {
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ userId: 'caller', role: MemberRole.OWNER })
        .mockResolvedValueOnce({ userId: 'target', role: MemberRole.OWNER });
      await expect(svc.kick('c1', 'caller', 'target')).rejects.toThrow('cannot kick the owner');
      expect(prisma.conversationMember.delete).not.toHaveBeenCalled();
    });

    it('deletes the target and emits conversation:removed', async () => {
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ userId: 'caller', role: MemberRole.OWNER })
        .mockResolvedValueOnce({ userId: 'target', role: MemberRole.MEMBER });
      prisma.conversationMember.delete.mockResolvedValue({});
      await svc.kick('c1', 'caller', 'target');
      expect(prisma.conversationMember.delete).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'c1', userId: 'target' } },
      });
      expect(realtime.emitToUser).toHaveBeenCalledWith('target', 'conversation:removed', { conversationId: 'c1' });
    });
  });

  // ---------------- leave ----------------
  describe('leave', () => {
    it('disbands (deletes conversation) when the last member leaves', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: MemberRole.MEMBER });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count.mockResolvedValue(0);
      prisma.conversation.delete.mockResolvedValue({});
      const r = await svc.leave('c1', 'u1');
      expect(r).toEqual({ disbanded: true });
      expect(prisma.conversation.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('a non-owner member simply leaves', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: MemberRole.MEMBER });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count.mockResolvedValue(2);
      const r = await svc.leave('c1', 'u1');
      expect(r).toEqual({ ok: true });
      expect(prisma.conversationMember.update).not.toHaveBeenCalled();
    });

    it('owner leaving with remaining members promotes the successor to OWNER and updates conversation.ownerId', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'owner', role: MemberRole.OWNER });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count.mockResolvedValue(2);
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'mem-id', userId: 'u2' });
      prisma.conversationMember.update.mockResolvedValue({});
      prisma.conversation.update.mockResolvedValue({});

      const r = await svc.leave('c1', 'owner');
      expect(r).toEqual({ ok: true });
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { id: 'mem-id' },
        data: { role: MemberRole.OWNER },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { ownerId: 'u2' },
      });
    });

    // FIXME: suspected bug — the comment says "promote oldest admin, else oldest member",
    // but orderBy role:'desc' with Prisma enum ordinal sort (OWNER=1,ADMIN=2,MEMBER=3)
    // returns MEMBER before ADMIN. This test documents the CURRENT orderBy call shape;
    // whether Prisma actually returns an admin vs a member is an integration concern.
    it('passes orderBy [{ role: desc }, { joinedAt: asc }] to findFirst (current behavior)', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'owner', role: MemberRole.OWNER });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count.mockResolvedValue(1);
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'x', userId: 'u2' });

      await svc.leave('c1', 'owner');
      expect(prisma.conversationMember.findFirst).toHaveBeenCalledWith({
        where: { conversationId: 'c1' },
        orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
      });
    });
  });

  // ---------------- guards ----------------
  describe('assertMember / assertPrivileged', () => {
    it('assertMember throws ForbiddenException when not a member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('c1', 'u1')).rejects.toThrow('not a group member');
    });

    it('assertPrivileged throws ForbiddenException for a MEMBER', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: MemberRole.MEMBER });
      await expect(svc.update('c1', 'u1', { name: 'x' } as any)).rejects.toThrow(
        'only owner / admin can do this',
      );
    });

    it('assertPrivileged allows ADMIN', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: MemberRole.ADMIN });
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });
      await svc.update('c1', 'u1', { name: 'new' } as any);
      expect(prisma.conversation.update).toHaveBeenCalled();
    });

    it('assertPrivileged allows OWNER', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1', role: MemberRole.OWNER });
      prisma.conversation.update.mockResolvedValue({ id: 'c1' });
      await svc.update('c1', 'u1', { name: 'new' } as any);
      expect(prisma.conversation.update).toHaveBeenCalled();
    });
  });

  // ---------------- findOne ----------------
  describe('findOne', () => {
    it('throws NotFoundException when conversation is not a GROUP', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', type: 'PRIVATE' });
      await expect(svc.findOne('c1', 'u1')).rejects.toThrow('group not found');
    });

    it('throws NotFoundException when conversation missing', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('c1', 'u1')).rejects.toThrow('group not found');
    });
  });
});
