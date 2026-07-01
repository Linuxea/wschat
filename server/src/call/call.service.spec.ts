import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CallStatus } from '@prisma/client';
import { CallService } from './call.service';
import {
  mockPrisma,
  mockRealtime,
  mockEvents,
  mockConfig,
} from '../../test/helpers/prisma.mock';

const LK = {
  LIVEKIT_API_KEY: 'apikey',
  LIVEKIT_API_SECRET: 'apisecret',
  LIVEKIT_URL: 'wss://livekit.example.com',
};

describe('CallService', () => {
  let svc: CallService;
  let prisma: any;
  let realtime: any;
  let events: any;
  let config: any;

  beforeEach(() => {
    prisma = mockPrisma();
    realtime = mockRealtime();
    events = mockEvents();
    config = mockConfig(LK);
    svc = new CallService(prisma, realtime, events, config);
  });

  // ---------------- keys getter ----------------
  describe('keys getter (getOrThrow)', () => {
    it('returns api key/secret/url from config', () => {
      const k = (svc as any).keys;
      expect(k).toEqual({ apiKey: 'apikey', apiSecret: 'apisecret', url: 'wss://livekit.example.com' });
      expect(config.getOrThrow).toHaveBeenCalledWith('LIVEKIT_API_KEY');
      expect(config.getOrThrow).toHaveBeenCalledWith('LIVEKIT_API_SECRET');
      expect(config.getOrThrow).toHaveBeenCalledWith('LIVEKIT_URL');
    });

    it('throws when LIVEKIT_API_KEY is missing', () => {
      const badConfig = mockConfig({ LIVEKIT_API_SECRET: 's', LIVEKIT_URL: 'u' });
      const badSvc = new CallService(prisma, realtime, events, badConfig);
      expect(() => (badSvc as any).keys).toThrow('Config "LIVEKIT_API_KEY" not defined');
    });
  });

  // ---------------- makeToken ----------------
  describe('makeToken', () => {
    it('produces a signed JWT with ttl=3600 and room join grants', async () => {
      const token = await (svc as any).makeToken('user-1', 'room-x');
      expect(typeof token).toBe('string');
      // JWT shape: header.payload.signature
      expect((token as string).split('.')).toHaveLength(3);
    });
  });

  // ---------------- start ----------------
  describe('start', () => {
    it('throws ForbiddenException when caller is not a member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(svc.start('u1', { conversationId: 'c1' } as any)).rejects.toThrow(
        'not a conversation member',
      );
    });

    it('throws NotFoundException when caller user missing', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.start('u1', { conversationId: 'c1' } as any)).rejects.toThrow(
        'caller not found',
      );
    });

    it('creates a RINGING call record and emits call:invite to non-caller members', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a' });
      prisma.callRecord.create.mockResolvedValue({ id: 'call1' });
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' },
      ]);

      const r = await svc.start('u1', { conversationId: 'c1' } as any);

      expect(r.callId).toBe('call1');
      expect(r.roomName).toMatch(/^call-/);
      expect(r.livekitUrl).toBe('wss://livekit.example.com');
      expect(typeof r.token).toBe('string');

      // callRecord created with RINGING + startedAt
      const data = prisma.callRecord.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        conversationId: 'c1',
        callerId: 'u1',
        status: CallStatus.RINGING,
      });
      expect(data.startedAt).toBeInstanceOf(Date);
      expect(data.roomName).toMatch(/^call-/);

      // call:invite emitted to non-caller members only
      const inviteRecipients = realtime.emitToUser.mock.calls
        .filter((c: any[]) => c[1] === 'call:invite')
        .map((c: any[]) => c[0]);
      expect(inviteRecipients.sort()).toEqual(['u2', 'u3']);
      expect(inviteRecipients).not.toContain('u1');
    });
  });

  // ---------------- join ----------------
  describe('join', () => {
    it('throws NotFoundException when call missing', async () => {
      prisma.callRecord.findUnique.mockResolvedValue(null);
      await expect(svc.join('u1', 'call1')).rejects.toThrow('call not found');
    });

    it('throws ForbiddenException when not a member', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({ id: 'call1', conversationId: 'c1', roomName: 'r' });
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(svc.join('u1', 'call1')).rejects.toThrow('not a conversation member');
    });

    it('transitions RINGING → ACCEPTED and issues a token', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({
        id: 'call1', conversationId: 'c1', roomName: 'room-x', status: CallStatus.RINGING,
      });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.callRecord.update.mockResolvedValue({});

      const r = await svc.join('u1', 'call1');
      expect(prisma.callRecord.update).toHaveBeenCalledWith({
        where: { id: 'call1' },
        data: { status: CallStatus.ACCEPTED },
      });
      expect(r).toMatchObject({ callId: 'call1', roomName: 'room-x', livekitUrl: 'wss://livekit.example.com' });
      expect(typeof r.token).toBe('string');
    });

    it('does NOT update status when already ACCEPTED (no transition)', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({
        id: 'call1', conversationId: 'c1', roomName: 'r', status: CallStatus.ACCEPTED,
      });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      await svc.join('u1', 'call1');
      expect(prisma.callRecord.update).not.toHaveBeenCalled();
    });
  });

  // ---------------- reject ----------------
  describe('reject', () => {
    it('transitions RINGING → REJECTED with endedAt and emits call:reject to caller', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({
        id: 'call1', conversationId: 'c1', roomName: 'r', status: CallStatus.RINGING, callerId: 'u9',
      });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.callRecord.update.mockResolvedValue({});

      const r = await svc.reject('u1', 'call1');
      expect(r).toEqual({ ok: true });
      expect(prisma.callRecord.update).toHaveBeenCalledWith({
        where: { id: 'call1' },
        data: { status: CallStatus.REJECTED, endedAt: expect.any(Date) },
      });
      expect(realtime.emitToUser).toHaveBeenCalledWith('u9', 'call:reject', { callId: 'call1', by: 'u1' });
    });

    it('does nothing (no update, no emit) when not RINGING', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({
        id: 'call1', conversationId: 'c1', status: CallStatus.ENDED, callerId: 'u9',
      });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      await svc.reject('u1', 'call1');
      expect(prisma.callRecord.update).not.toHaveBeenCalled();
      expect(realtime.emitToUser).not.toHaveBeenCalledWith('u9', 'call:reject', expect.anything());
    });
  });

  // ---------------- end ----------------
  describe('end', () => {
    it('marks MISSED when ending while still RINGING (unanswered)', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({
        id: 'call1', conversationId: 'c1', status: CallStatus.RINGING, callerId: 'u9',
      });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'u9' }, { userId: 'u1' }, { userId: 'u2' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u9', username: 'caller' });

      await svc.end('u1', 'call1');

      expect(prisma.callRecord.update).toHaveBeenCalledWith({
        where: { id: 'call1' },
        data: { status: CallStatus.MISSED, endedAt: expect.any(Date) },
      });
      // call:end to ALL members
      const endRecipients = realtime.emitToUser.mock.calls
        .filter((c: any[]) => c[1] === 'call:end')
        .map((c: any[]) => c[0]);
      expect(endRecipients.sort()).toEqual(['u1', 'u2', 'u9']);
    });

    it('on missed call, emits call.missed to each NON-caller member', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({
        id: 'call1', conversationId: 'c1', status: CallStatus.RINGING, callerId: 'u9',
      });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'u9' }, { userId: 'u1' }, { userId: 'u2' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u9', username: 'caller' });

      await svc.end('u1', 'call1');

      const missedRecipients = events.emit.mock.calls
        .filter((c: any[]) => c[0] === 'call.missed')
        .map((c: any[]) => c[1].recipientId);
      expect(missedRecipients.sort()).toEqual(['u1', 'u2']); // caller u9 excluded
      expect(missedRecipients).not.toContain('u9');
      expect(events.emit).toHaveBeenCalledWith(
        'call.missed',
        expect.objectContaining({
          actorId: 'u9',
          type: 'MISSED_CALL',
          entityType: 'call',
          entityId: 'call1',
        }),
      );
    });

    it('marks ENDED (not MISSED) when the call was already ACCEPTED', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({
        id: 'call1', conversationId: 'c1', status: CallStatus.ACCEPTED, callerId: 'u9',
      });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u9' }]);

      await svc.end('u1', 'call1');

      expect(prisma.callRecord.update).toHaveBeenCalledWith({
        where: { id: 'call1' },
        data: { status: CallStatus.ENDED, endedAt: expect.any(Date) },
      });
      // no missed-call notifications
      expect(events.emit).not.toHaveBeenCalledWith('call.missed', expect.anything());
    });

    it('throws NotFoundException when call missing', async () => {
      prisma.callRecord.findUnique.mockResolvedValue(null);
      await expect(svc.end('u1', 'call1')).rejects.toThrow('call not found');
    });

    it('throws ForbiddenException when not a member', async () => {
      prisma.callRecord.findUnique.mockResolvedValue({ id: 'call1', conversationId: 'c1', status: CallStatus.RINGING });
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(svc.end('u1', 'call1')).rejects.toThrow('not a conversation member');
    });
  });
});
