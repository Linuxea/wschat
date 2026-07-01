import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { MomentsService } from './moments.service';
import { CreateMomentDto, CommentDto } from './dto';

@Controller('moments')
@UseGuards(JwtAuthGuard)
export class MomentsController {
  constructor(private readonly moments: MomentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMomentDto) {
    return this.moments.create(user.id, dto);
  }

  @Get('feed')
  feed(
    @CurrentUser() user: AuthUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.moments.feed(user.id, before, limit ? parseInt(limit, 10) : 30);
  }

  @Get('user/:userId')
  findByUser(@CurrentUser() user: AuthUser, @Param('userId') targetUserId: string) {
    return this.moments.findByUser(user.id, targetUserId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moments.findOne(id, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moments.delete(id, user.id);
  }

  @Post(':id/like')
  like(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moments.toggleLike(id, user.id);
  }

  @Post(':id/comments')
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CommentDto,
  ) {
    return this.moments.comment(id, user.id, dto);
  }

  @Delete('comments/:commentId')
  deleteComment(@CurrentUser() user: AuthUser, @Param('commentId') commentId: string) {
    return this.moments.deleteComment(commentId, user.id);
  }
}
