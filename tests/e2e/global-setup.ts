import { Redis } from 'ioredis';

/**
 * All e2e traffic comes from one IP, so IP-based rate limits (working as designed) would make
 * repeated local runs fail. Clear rate-limit counters — and only those — before a run.
 */
export default async function globalSetup() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'rl:*', 'COUNT', 500);
      if (keys.length > 0) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
}
