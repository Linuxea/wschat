import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CallService } from './call.service';
import { StartCallDto } from './dto';

@Controller('call')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(private readonly call: CallService) {}

  @Post('start')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartCallDto) {
    return this.call.start(user.id, dto);
  }

  @Post(':id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.call.join(user.id, id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.call.reject(user.id, id);
  }

  @Post(':id/end')
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.call.end(user.id, id);
  }
}
