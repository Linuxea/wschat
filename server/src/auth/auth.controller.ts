import { Body, Controller, Post, Query, Get } from '@nestjs/common';
import { Throttle } from '../common/throttle.decorator';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, ResetPasswordDto, RefreshDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(10, 60)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @Throttle(10, 60)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('security-question')
  getSecurityQuestion(@Query('username') username: string) {
    return this.auth.getSecurityQuestion(username);
  }

  @Post('reset-password')
  @Throttle(5, 60)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}
