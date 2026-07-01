import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { RedisService } from '../redis/redis.service';

/**
 * Bridges domain services and the Socket.io server.
 * Online presence is tracked in Redis as a set of socket ids per user
 * (reference counting supports multi-device sessions).
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  constructor(private readonly redis: RedisService) {}

  setServer(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, data: unknown) {
    if (!this.server) {
      this.logger.warn(`socket server not ready, dropping event=${event}`);
      return;
    }
    this.server.to(this.userRoom(userId)).emit(event, data);
  }

  userRoom(userId: string) {
    return `user:${userId}`;
  }

  async addSocket(userId: string, socketId: string) {
    return this.redis.sadd(`online:${userId}`, socketId);
  }

  async removeSocket(userId: string, socketId: string) {
    return this.redis.srem(`online:${userId}`, socketId);
  }

  async isOnline(userId: string): Promise<boolean> {
    const n = await this.redis.scard(`online:${userId}`);
    return n > 0;
  }
}
