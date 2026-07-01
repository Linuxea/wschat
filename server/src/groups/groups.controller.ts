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
import { GroupsService } from './groups.service';
import { CreateGroupDto, InviteDto, UpdateGroupDto } from './dto';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groups.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.groups.list(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.groups.findOne(id, user.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.groups.update(id, user.id, dto);
  }

  @Post(':id/members')
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: InviteDto,
  ) {
    return this.groups.invite(id, user.id, dto);
  }

  @Delete(':id/members/:userId')
  kick(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') targetId: string,
  ) {
    return this.groups.kick(id, user.id, targetId);
  }

  @Post(':id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.groups.leave(id, user.id);
  }
}
