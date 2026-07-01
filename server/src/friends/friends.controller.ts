import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { FriendsService } from './friends.service';
import {
  SendRequestDto,
  UpdateRemarkDto,
  CreateTagDto,
  SetFriendTagsDto,
} from './dto';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  // ---- requests ----
  @Post('requests')
  sendRequest(@CurrentUser() user: AuthUser, @Body() dto: SendRequestDto) {
    return this.friends.sendRequest(user.id, dto);
  }

  @Get('requests/incoming')
  incoming(@CurrentUser() user: AuthUser) {
    return this.friends.listIncoming(user.id);
  }

  @Get('requests/outgoing')
  outgoing(@CurrentUser() user: AuthUser) {
    return this.friends.listOutgoing(user.id);
  }

  @Post('requests/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.friends.acceptRequest(user.id, id);
  }

  @Post('requests/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.friends.rejectRequest(user.id, id);
  }

  // ---- list & profile ----
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.friends.list(user.id);
  }

  @Patch(':friendId')
  updateRemark(
    @CurrentUser() user: AuthUser,
    @Param('friendId') friendId: string,
    @Body() dto: UpdateRemarkDto,
  ) {
    return this.friends.updateRemark(user.id, friendId, dto);
  }

  @Post(':friendId/block')
  block(@CurrentUser() user: AuthUser, @Param('friendId') friendId: string) {
    return this.friends.setBlocked(user.id, friendId, true);
  }

  @Delete(':friendId/block')
  unblock(@CurrentUser() user: AuthUser, @Param('friendId') friendId: string) {
    return this.friends.setBlocked(user.id, friendId, false);
  }

  @Post(':friendId/moments-block')
  blockMoments(@CurrentUser() user: AuthUser, @Param('friendId') friendId: string) {
    return this.friends.setMomentsBlocked(user.id, friendId, true);
  }

  @Delete(':friendId/moments-block')
  unblockMoments(@CurrentUser() user: AuthUser, @Param('friendId') friendId: string) {
    return this.friends.setMomentsBlocked(user.id, friendId, false);
  }

  @Post(':friendId/tags')
  setTags(
    @CurrentUser() user: AuthUser,
    @Param('friendId') friendId: string,
    @Body() dto: SetFriendTagsDto,
  ) {
    return this.friends.setFriendTags(user.id, friendId, dto);
  }

  // ---- tags ----
  @Get('tags')
  listTags(@CurrentUser() user: AuthUser) {
    return this.friends.listTags(user.id);
  }

  @Post('tags')
  createTag(@CurrentUser() user: AuthUser, @Body() dto: CreateTagDto) {
    return this.friends.createTag(user.id, dto);
  }

  @Delete('tags/:id')
  deleteTag(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.friends.deleteTag(user.id, id);
  }
}
