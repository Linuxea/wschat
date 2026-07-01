import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { nanoid } from 'nanoid';
import { CallStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../common/realtime/realtime.service';
import { PUBLIC_USER_SELECT } from '../users/users.service';
import { StartCallDto } from './dto';

@Injectable()
export class CallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  private get keys() {
    return {
      apiKey: this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      apiSecret: this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      url: this.config.getOrThrow<string>('LIVEKIT_URL'),
    };
  }

  private async makeToken(identity: string, roomName: string) {
    const { apiKey, apiSecret } = this.keys;
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: 60 * 60,
    });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
    return at.toJwt();
  }

  async start(userId: string, dto: StartCallDto) {
    await this.assertMember(dto.conversationId, userId);
    const roomName = `call-${nanoid(10)}`;
    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!caller) throw new NotFoundException('caller not found');

    const record = await this.prisma.callRecord.create({
      data: {
        conversationId: dto.conversationId,
        callerId: userId,
        roomName,
        status: CallStatus.RINGING,
        startedAt: new Date(),
      },
    });

    const token = await this.makeToken(userId, roomName);

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: dto.conversationId },
      select: { userId: true },
    });
    for (const m of members) {
      if (m.userId !== userId) {
        this.realtime.emitToUser(m.userId, 'call:invite', {
          callId: record.id,
          conversationId: dto.conversationId,
          roomName,
          caller,
        });
      }
    }

    return { callId: record.id, roomName, token, livekitUrl: this.keys.url };
  }

  async join(userId: string, callId: string) {
    const record = await this.prisma.callRecord.findUnique({ where: { id: callId } });
    if (!record) throw new NotFoundException('call not found');
    await this.assertMember(record.conversationId, userId);

    if (record.status === CallStatus.RINGING) {
      await this.prisma.callRecord.update({
        where: { id: callId },
        data: { status: CallStatus.ACCEPTED },
      });
    }
    const token = await this.makeToken(userId, record.roomName);
    return { callId, roomName: record.roomName, token, livekitUrl: this.keys.url };
  }

  async reject(userId: string, callId: string) {
    const record = await this.prisma.callRecord.findUnique({ where: { id: callId } });
    if (!record) throw new NotFoundException('call not found');
    await this.assertMember(record.conversationId, userId);
    if (record.status === CallStatus.RINGING) {
      await this.prisma.callRecord.update({
        where: { id: callId },
        data: { status: CallStatus.REJECTED, endedAt: new Date() },
      });
      this.realtime.emitToUser(record.callerId, 'call:reject', { callId, by: userId });
    }
    return { ok: true };
  }

  async end(userId: string, callId: string) {
    const record = await this.prisma.callRecord.findUnique({ where: { id: callId } });
    if (!record) throw new NotFoundException('call not found');
    await this.assertMember(record.conversationId, userId);

    // 仍在响铃状态即结束 = 被叫未接听 → 判为未接来电
    const missed = record.status === CallStatus.RINGING;
    await this.prisma.callRecord.update({
      where: { id: callId },
      data: { status: missed ? CallStatus.MISSED : CallStatus.ENDED, endedAt: new Date() },
    });

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: record.conversationId },
      select: { userId: true },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'call:end', { callId });
    }

    // 给未接听方（非主叫）发未接来电通知
    if (missed) {
      const caller = await this.prisma.user.findUnique({
        where: { id: record.callerId },
        select: PUBLIC_USER_SELECT,
      });
      for (const m of members) {
        if (m.userId === record.callerId) continue;
        this.events.emit('call.missed', {
          recipientId: m.userId,
          actorId: record.callerId,
          type: 'MISSED_CALL',
          entityType: 'call',
          entityId: callId,
          payload: { conversationId: record.conversationId, caller },
        });
      }
    }
    return { ok: true };
  }

  private async assertMember(conversationId: string, userId: string) {
    const m = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!m) throw new ForbiddenException('not a conversation member');
    return m;
  }
}
