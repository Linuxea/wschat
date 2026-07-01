import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';
import { RegisterDto, LoginDto, ResetPasswordDto } from './dto';

const BCRYPT_ROUNDS = 10;

export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  bio: string | null;
}

function toPublic(u: {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  bio: string | null;
}): PublicUser {
  return { id: u.id, username: u.username, nickname: u.nickname, avatar: u.avatar, bio: u.bio };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException('username already taken');

    const [passwordHash, securityAnswerHash] = await Promise.all([
      bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      bcrypt.hash(dto.securityAnswer.trim().toLowerCase(), BCRYPT_ROUNDS),
    ]);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        nickname: dto.nickname,
        securityQuestion: dto.securityQuestion,
        securityAnswerHash,
      },
    });

    return this.issueTokens(user.id, user.username, user.tokenVersion, toPublic(user));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    return this.issueTokens(user.id, user.username, user.tokenVersion, toPublic(user));
  }

  async getSecurityQuestion(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { securityQuestion: true },
    });
    if (!user) throw new NotFoundException('user not found');
    return { securityQuestion: user.securityQuestion };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new NotFoundException('user not found');
    const ok = await bcrypt.compare(dto.securityAnswer.trim().toLowerCase(), user.securityAnswerHash);
    if (!ok) throw new BadRequestException('security answer is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    // bump tokenVersion -> invalidates all previously issued tokens
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (payload.t !== 'r') throw new UnauthorizedException('not a refresh token');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, tokenVersion: true, nickname: true, avatar: true, bio: true },
    });
    if (!user) throw new UnauthorizedException('user not found');
    if (user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('token revoked');
    }
    return this.issueTokens(user.id, user.username, user.tokenVersion, toPublic(user));
  }

  private async issueTokens(
    userId: string,
    username: string,
    ver: number,
    user: PublicUser,
  ) {
    const accessPayload: JwtPayload = { sub: userId, username, ver, t: 'a' };
    const refreshPayload: JwtPayload = { sub: userId, username, ver, t: 'r' };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
    });

    return { accessToken, refreshToken, user };
  }
}
