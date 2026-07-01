import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { MessagesModule } from '../messages/messages.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MessagesModule, AuthModule],
  providers: [EventsGateway],
})
export class EventsModule {}
