import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { ReadDto } from './dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.list(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.findOne(id, user.id);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReadDto) {
    return this.conversations.markRead(id, user.id, dto.seq);
  }

  @Post(':id/pin')
  pin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.setPinned(id, user.id, true);
  }

  @Delete(':id/pin')
  unpin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.setPinned(id, user.id, false);
  }

  @Post(':id/mute')
  mute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.setMuted(id, user.id, true);
  }

  @Delete(':id/mute')
  unmute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.setMuted(id, user.id, false);
  }
}
