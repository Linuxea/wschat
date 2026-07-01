import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { SearchMessagesDto, HistoryQuery } from './dto';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversation/:conversationId')
  history(
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Query() q: HistoryQuery,
  ) {
    return this.messages.history(conversationId, user.id, q.beforeSeq, q.limit ?? 50);
  }

  @Post('conversation/:conversationId/search')
  search(
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: SearchMessagesDto,
  ) {
    return this.messages.search(conversationId, user.id, dto.q, dto.limit ?? 30);
  }

  @Post(':id/recall')
  recall(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messages.recall(id, user.id);
  }
}
