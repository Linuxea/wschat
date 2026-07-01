import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../common/realtime/realtime.service';
import { MessagesService } from '../messages/messages.service';
import { SendMessageDto } from '../messages/dto';
import { JwtPayload } from '../auth/jwt.strategy';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/',
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly messages: MessagesService,
  ) {}

  afterInit() {
    this.realtime.setServer(this.server);
    this.logger.log('Socket.io gateway ready');
  }

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) return this.reject(socket, 'no token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return this.reject(socket, 'invalid token');
    }
    if (payload.t !== 'a') return this.reject(socket, 'wrong token type');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== payload.ver) {
      return this.reject(socket, 'token revoked');
    }

    socket.data.userId = user.id;
    socket.data.username = user.username;
    await socket.join(this.realtime.userRoom(user.id));

    const wasOnline = await this.realtime.isOnline(user.id);
    await this.realtime.addSocket(user.id, socket.id);
    if (!wasOnline) await this.announcePresence(user.id, true);

    socket.emit('connected', { userId: user.id, username: user.username });
    this.logger.debug(`connected ${user.username} (${socket.id})`);
  }

  async handleDisconnect(socket: Socket) {
    const userId: string | undefined = socket.data.userId;
    if (!userId) return;
    await this.realtime.removeSocket(userId, socket.id);
    const still = await this.realtime.isOnline(userId);
    if (!still) await this.announcePresence(userId, false);
    this.logger.debug(`disconnected ${socket.data.username} (${socket.id})`);
  }

  private async announcePresence(userId: string, online: boolean) {
    const rows = await this.prisma.friendship.findMany({
      where: { friendId: userId },
      select: { ownerId: true },
    });
    for (const r of rows) {
      this.realtime.emitToUser(r.ownerId, 'presence:update', { userId, online });
    }
  }

  private reject(socket: Socket, reason: string) {
    this.logger.warn(`socket rejected: ${reason}`);
    socket.emit('error', { message: `unauthorized: ${reason}` });
    socket.disconnect(true);
  }

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const userId: string = socket.data.userId;
    const result = await this.messages.send(userId, dto);
    return result.ack;
  }

  @SubscribeMessage('message:recall')
  async onMessageRecall(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { messageId: string },
  ) {
    const userId: string = socket.data.userId;
    return this.messages.recall(body.messageId, userId);
  }

  @SubscribeMessage('message:sync')
  async onMessageSync(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string; lastSeq: number },
  ) {
    const userId: string = socket.data.userId;
    return this.messages.history(body.conversationId, userId, undefined, 50);
  }

  @SubscribeMessage('typing')
  async onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string; typing: boolean },
  ) {
    const userId: string = socket.data.userId;
    // relay to other members of the conversation
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: body.conversationId },
      select: { userId: true },
    });
    for (const m of members) {
      if (m.userId !== userId) {
        this.realtime.emitToUser(m.userId, 'typing', {
          conversationId: body.conversationId,
          userId,
          typing: body.typing,
        });
      }
    }
    return { ok: true };
  }
}
