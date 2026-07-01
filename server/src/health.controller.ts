import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';
    } catch (e) {
      checks.db = 'error';
    }
    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch (e) {
      checks.redis = 'error';
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    return { status: ok ? 'ok' : 'degraded', checks, time: new Date().toISOString() };
  }
}
