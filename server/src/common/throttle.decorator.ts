import { applyDecorators } from '@nestjs/common';

/**
 * Rate-limit decorator (placeholder for demo).
 * Accepts (limit, ttlSeconds) but is currently a no-op.
 * TODO: wire to @nestjs/throttler with a Redis store before production.
 */
export function Throttle(
  _limit: number,
  _ttlSeconds: number,
): MethodDecorator & ClassDecorator {
  return applyDecorators();
}
