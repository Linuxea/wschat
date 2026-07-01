import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
    super(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
    this.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.on('connect', () => this.logger.log('Redis connected'));
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
