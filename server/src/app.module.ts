import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FriendsModule } from './friends/friends.module';
import { UploadModule } from './upload/upload.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { EventsModule } from './events/events.module';
import { GroupsModule } from './groups/groups.module';
import { CallModule } from './call/call.module';
import { MomentsModule } from './moments/moments.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    UploadModule,
    ConversationsModule,
    MessagesModule,
    GroupsModule,
    CallModule,
    MomentsModule,
    EventsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
