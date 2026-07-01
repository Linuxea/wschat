import { Logger } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

function makeRedis(overrides: Record<string, any> = {}) {
  return {
    sadd: jest.fn(),
    srem: jest.fn(),
    scard: jest.fn(),
    ...overrides,
  };
}

/** Minimal Socket.io Server stub: server.to(room).emit(event, data). */
function makeServer() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

describe('RealtimeService', () => {
  let svc: RealtimeService;
  let redis: any;

  beforeEach(() => {
    redis = makeRedis();
    svc = new RealtimeService(redis as any);
  });

  describe('userRoom', () => {
    it('returns "user:<id>"', () => {
      expect(svc.userRoom('u1')).toBe('user:u1');
      expect(svc.userRoom('abc-123')).toBe('user:abc-123');
    });
  });

  describe('emitToUser — server not ready (default state)', () => {
    let warnSpy: jest.SpyInstance;
    beforeEach(() => {
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('does not throw and returns undefined', () => {
      expect(() => svc.emitToUser('u1', 'message:new', { x: 1 })).not.toThrow();
      expect(svc.emitToUser('u1', 'message:new', { x: 1 })).toBeUndefined();
    });

    it('logs a warn mentioning the dropped event name', () => {
      svc.emitToUser('u1', 'message:new', {});
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('socket server not ready'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('event=message:new'));
    });

    it('does not touch redis (emit is independent of presence tracking)', () => {
      svc.emitToUser('u1', 'x', null);
      expect(redis.sadd).not.toHaveBeenCalled();
      expect(redis.srem).not.toHaveBeenCalled();
      expect(redis.scard).not.toHaveBeenCalled();
    });
  });

  describe('emitToUser — server ready', () => {
    it('emits event+data to the user room after setServer', () => {
      const server = makeServer();
      svc.setServer(server as any);
      svc.emitToUser('u42', 'message:new', { id: 9 });
      expect(server.to).toHaveBeenCalledWith('user:u42');
      expect(server.emit).toHaveBeenCalledWith('message:new', { id: 9 });
    });

    it('routes different users to their own rooms', () => {
      const server = makeServer();
      svc.setServer(server as any);
      svc.emitToUser('a', 'e', 1);
      svc.emitToUser('b', 'e', 2);
      expect(server.to).toHaveBeenNthCalledWith(1, 'user:a');
      expect(server.to).toHaveBeenNthCalledWith(2, 'user:b');
    });

    it('does not warn when the server is set', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const server = makeServer();
      svc.setServer(server as any);
      svc.emitToUser('u1', 'e', null);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('setServer', () => {
    it('switches the service from not-ready to ready', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      // before setServer -> warn path
      svc.emitToUser('u1', 'e', null);
      expect(warnSpy).toHaveBeenCalled();

      // after setServer -> emit path
      const server = makeServer();
      svc.setServer(server as any);
      warnSpy.mockClear();
      svc.emitToUser('u1', 'e', null);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(server.emit).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('addSocket', () => {
    it('sadds the socketId to "online:<userId>"', async () => {
      redis.sadd.mockResolvedValue(1);
      await svc.addSocket('u1', 'sock-1');
      expect(redis.sadd).toHaveBeenCalledWith('online:u1', 'sock-1');
    });

    it('returns the sadd result (number of added elements)', async () => {
      redis.sadd.mockResolvedValue(1);
      await expect(svc.addSocket('u1', 'sock-1')).resolves.toBe(1);
    });
  });

  describe('removeSocket', () => {
    it('srems the socketId from "online:<userId>"', async () => {
      redis.srem.mockResolvedValue(0);
      await svc.removeSocket('u1', 'sock-1');
      expect(redis.srem).toHaveBeenCalledWith('online:u1', 'sock-1');
    });

    it('returns the srem result', async () => {
      redis.srem.mockResolvedValue(1);
      await expect(svc.removeSocket('u1', 'sock-1')).resolves.toBe(1);
    });
  });

  describe('isOnline', () => {
    it('queries scard of "online:<userId>"', async () => {
      redis.scard.mockResolvedValue(0);
      await svc.isOnline('u1');
      expect(redis.scard).toHaveBeenCalledWith('online:u1');
    });

    it('returns false when scard === 0', async () => {
      redis.scard.mockResolvedValue(0);
      await expect(svc.isOnline('u1')).resolves.toBe(false);
    });

    it('returns true when scard > 0', async () => {
      redis.scard.mockResolvedValue(3);
      await expect(svc.isOnline('u1')).resolves.toBe(true);
    });

    it('returns true at the boundary scard === 1', async () => {
      redis.scard.mockResolvedValue(1);
      await expect(svc.isOnline('u1')).resolves.toBe(true);
    });
  });
});
