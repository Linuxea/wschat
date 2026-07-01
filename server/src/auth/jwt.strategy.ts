import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';

export interface JwtPayload {
  sub: string; // userId
  username: string;
  ver: number; // tokenVersion — bump invalidates all tokens
  t: 'a' | 'r'; // access | refresh
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.t !== 'a') {
      throw new UnauthorizedException('Invalid token type');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, tokenVersion: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Token revoked');
    }
    return { id: user.id, username: user.username } as const;
  }
}
