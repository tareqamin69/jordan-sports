import type { Redis } from 'ioredis';
import { AppError, Errors } from '../http/errors.js';

export interface RateLimitRule {
  /** Namespace, e.g. `otp.request.phone`. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

/**
 * Fixed-window counters in Redis. Redis is never a source of truth for business data
 * (ADR-0007); losing counters only resets limits. If Redis is unreachable the limiter fails
 * closed for the protected action (abuse and SMS cost protection).
 */
export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(rule: RateLimitRule, subject: string, nowMs = Date.now()): Promise<RateLimitResult> {
    const window = Math.floor(nowMs / 1000 / rule.windowSeconds);
    const key = `rl:${rule.name}:${subject}:${window}`;
    let count: number;
    try {
      const results = await this.redis
        .multi()
        .incr(key)
        .expire(key, rule.windowSeconds, 'NX')
        .exec();
      count = Number(results?.[0]?.[1]);
      if (!Number.isFinite(count)) throw new Error('Unexpected Redis response');
    } catch {
      throw new AppError('SERVICE_UNAVAILABLE', 503);
    }
    const windowEndsMs = (window + 1) * rule.windowSeconds * 1000;
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((windowEndsMs - nowMs) / 1000)),
    };
  }

  /** Throws 429 RATE_LIMITED when any rule is exceeded. */
  async enforce(checks: ReadonlyArray<readonly [RateLimitRule, string]>): Promise<void> {
    for (const [rule, subject] of checks) {
      const result = await this.hit(rule, subject);
      if (!result.allowed) throw Errors.rateLimited(result.retryAfterSeconds);
    }
  }
}
