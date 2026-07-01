import { EventsGateway } from './events.gateway';
import { mockPrisma, mockRealtime } from '../../test/helpers/prisma.mock';

function fakeSocket(over: Partial<any> = {}) {
  return {
    id: 'sock1',
    handshake: { auth: { token: 'tok' } },
    data: {} as any,
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    ...over,
  };
}

describe('EventsGateway', () => {
  let gw: EventsGateway;
  let jwt: any;
  let prisma: any;
  let realtime: any;
  let messages: any;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    prisma = mockPrisma();
    realtime = mockRealtime();
    messages = { send: jest.fn(), recall: jest.fn(), history: jest.fn() };
    gw = new EventsGateway(jwt, prisma, realtime, messages);
  });

  // ---------------- afterInit ----------------
  describe('afterInit', () => {
    it('calls realtime.setServer with the gateway server', () => {
      const server = { emit: jest.fn() } as any;
      gw.server = server;
      gw.afterInit();
      expect(realtime.setServer).toHaveBeenCalledWith(server);
    });
  });

  // ---------------- handleConnection ----------------
  describe('handleConnection', () => {
    it('rejects with "no token" when handshake.auth has no token', async () => {
      const socket = fakeSocket({ handshake: { auth: {} } });
      await gw.handleConnection(socket as any);
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'unauthorized: no token' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(jwt.verifyAsync).not.toHaveBeenCalled();
    });

    it('rejects with "invalid token" when jwt.verifyAsync throws', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad sig'));
      const socket = fakeSocket();
      await gw.handleConnection(socket as any);
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'unauthorized: invalid token' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects with "wrong token type" when payload.t !== "a"', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'a', ver: 0, t: 'r' });
      const socket = fakeSocket();
      await gw.handleConnection(socket as any);
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'unauthorized: wrong token type' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects with "token revoked" when user is missing', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'a', ver: 0, t: 'a' });
      prisma.user.findUnique.mockResolvedValue(null);
      const socket = fakeSocket();
      await gw.handleConnection(socket as any);
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'unauthorized: token revoked' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects with "token revoked" when tokenVersion differs', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'a', ver: 0, t: 'a' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a', tokenVersion: 5 });
      const socket = fakeSocket();
      await gw.handleConnection(socket as any);
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'unauthorized: token revoked' });
    });

    describe('on success', () => {
      let socket: any;
      beforeEach(() => {
        jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'alice', ver: 3, t: 'a' });
        prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'alice', tokenVersion: 3 });
        realtime.isOnline.mockResolvedValue(false);
        prisma.friendship.findMany.mockResolvedValue([{ ownerId: 'f1' }, { ownerId: 'f2' }]);
        socket = fakeSocket();
      });

      it('sets socket.data.userId/username, joins userRoom, emits "connected"', async () => {
        await gw.handleConnection(socket as any);
        expect(socket.data).toMatchObject({ userId: 'u1', username: 'alice' });
        expect(socket.join).toHaveBeenCalledWith('user:u1');
        expect(socket.emit).toHaveBeenCalledWith('connected', { userId: 'u1', username: 'alice' });
      });

      it('adds the socket to redis presence', async () => {
        await gw.handleConnection(socket as any);
        expect(realtime.addSocket).toHaveBeenCalledWith('u1', 'sock1');
      });

      it('announces presence (online) only when the user was NOT already online', async () => {
        realtime.isOnline.mockResolvedValue(false); // wasOffline -> announce
        await gw.handleConnection(socket as any);
        expect(realtime.emitToUser).toHaveBeenCalledWith('f1', 'presence:update', { userId: 'u1', online: true });
        expect(realtime.emitToUser).toHaveBeenCalledWith('f2', 'presence:update', { userId: 'u1', online: true });
      });

      it('does NOT announce presence when the user was already online (multi-device)', async () => {
        realtime.isOnline.mockResolvedValue(true); // wasOnline -> skip
        await gw.handleConnection(socket as any);
        const presenceCalls = realtime.emitToUser.mock.calls.filter((c: any[]) => c[1] === 'presence:update');
        expect(presenceCalls).toHaveLength(0);
      });

      it('queries friendships where the connected user is the friend (friendId)', async () => {
        await gw.handleConnection(socket as any);
        expect(prisma.friendship.findMany).toHaveBeenCalledWith({
          where: { friendId: 'u1' },
          select: { ownerId: true },
        });
      });
    });
  });

  // ---------------- handleDisconnect ----------------
  describe('handleDisconnect', () => {
    it('returns early when socket.data.userId is unset (never authenticated)', async () => {
      const socket = fakeSocket({ data: {} });
      await gw.handleDisconnect(socket as any);
      expect(realtime.removeSocket).not.toHaveBeenCalled();
    });

    it('removes the socket and announces offline when no sockets remain', async () => {
      realtime.isOnline.mockResolvedValue(false);
      prisma.friendship.findMany.mockResolvedValue([{ ownerId: 'f1' }]);
      const socket = fakeSocket({ id: 'sock9', data: { userId: 'u1', username: 'a' } });
      await gw.handleDisconnect(socket as any);
      expect(realtime.removeSocket).toHaveBeenCalledWith('u1', 'sock9');
      expect(realtime.emitToUser).toHaveBeenCalledWith('f1', 'presence:update', { userId: 'u1', online: false });
    });

    it('does NOT announce offline when other sockets remain (still online)', async () => {
      realtime.isOnline.mockResolvedValue(true);
      const socket = fakeSocket({ data: { userId: 'u1', username: 'a' } });
      await gw.handleDisconnect(socket as any);
      expect(realtime.removeSocket).toHaveBeenCalledWith('u1', 'sock1');
      const presenceCalls = realtime.emitToUser.mock.calls.filter((c: any[]) => c[1] === 'presence:update');
      expect(presenceCalls).toHaveLength(0);
    });
  });

  // ---------------- message handlers ----------------
  describe('onMessageSend', () => {
    it('calls messages.send and returns ONLY the ack (not the message view)', async () => {
      messages.send.mockResolvedValue({
        ack: { id: 'm1', clientMsgId: 'cm1', seq: 5, createdAt: new Date(1), rejected: false },
        message: { id: 'm1', content: 'secret' },
      });
      const socket = fakeSocket({ data: { userId: 'u1' } });
      const r = await gw.onMessageSend(socket as any, { conversationId: 'c1', type: 'TEXT', content: 'hi', clientMsgId: 'cm1' } as any);
      expect(messages.send).toHaveBeenCalledWith('u1', expect.objectContaining({ conversationId: 'c1' }));
      expect(r).toEqual({ id: 'm1', clientMsgId: 'cm1', seq: 5, createdAt: expect.any(Date), rejected: false });
      expect(r).not.toHaveProperty('content'); // ack only, no message body
    });
  });

  describe('onMessageRecall', () => {
    it('calls messages.recall with the messageId and socket userId', async () => {
      messages.recall.mockResolvedValue({ ok: true });
      const socket = fakeSocket({ data: { userId: 'u1' } });
      const r = await gw.onMessageRecall(socket as any, { messageId: 'm1' });
      expect(messages.recall).toHaveBeenCalledWith('m1', 'u1');
      expect(r).toEqual({ ok: true });
    });
  });

  describe('onMessageSync', () => {
    // FIXME: suspected bug — body.lastSeq is received but ignored; the gateway
    // always fetches the latest 50 (passes `undefined` as beforeSeq).
    it('calls history with beforeSeq=undefined (ignores body.lastSeq)', async () => {
      messages.history.mockResolvedValue([]);
      const socket = fakeSocket({ data: { userId: 'u1' } });
      await gw.onMessageSync(socket as any, { conversationId: 'c1', lastSeq: 100 });
      expect(messages.history).toHaveBeenCalledWith('c1', 'u1', undefined, 50);
    });
  });

  describe('onTyping', () => {
    it('relays "typing" to OTHER members of the conversation (excludes self)', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' },
      ]);
      const socket = fakeSocket({ data: { userId: 'u1' } });
      await gw.onTyping(socket as any, { conversationId: 'c1', typing: true });
      const recipients = realtime.emitToUser.mock.calls
        .filter((c: any[]) => c[1] === 'typing')
        .map((c: any[]) => c[0]);
      expect(recipients.sort()).toEqual(['u2', 'u3']);
      expect(recipients).not.toContain('u1');
      expect(realtime.emitToUser).toHaveBeenCalledWith('u2', 'typing', {
        conversationId: 'c1', userId: 'u1', typing: true,
      });
    });

    it('relays typing=false on stop', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
      const socket = fakeSocket({ data: { userId: 'u1' } });
      await gw.onTyping(socket as any, { conversationId: 'c1', typing: false });
      expect(realtime.emitToUser).toHaveBeenCalledWith('u2', 'typing', expect.objectContaining({ typing: false }));
    });
  });
});
