import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { RateLimiter } from './rate-limiter.js';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new Redis(config.redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3_000,
          // Commands issued while (re)connecting wait briefly instead of failing immediately; if
          // Redis stays unavailable they fail after the timeout and callers fail closed.
          commandTimeout: 2_000,
        }),
    },
    { provide: RateLimiter, inject: [REDIS], useFactory: (redis: Redis) => new RateLimiter(redis) },
  ],
  exports: [REDIS, RateLimiter],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
  }
}
