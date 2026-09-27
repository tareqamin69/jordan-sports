import { randomInt } from 'node:crypto';
import type { Db, Tx } from './database.js';
import { pgErrorCode, PgError } from './errors.js';

const RETRYABLE = new Set<string>([PgError.serializationFailure, PgError.deadlockDetected]);

/**
 * Runs `fn` in a transaction, retrying serialization failures and deadlocks (40001/40P01) up to
 * `retries` times with jittered backoff (docs/architecture.md §G). Concurrent conflicting inserts
 * against an exclusion constraint can deadlock; the retry then sees the committed winner and fails
 * with a normal exclusion violation (23P01), which is never retried.
 */
export async function transaction<T>(db: Db, fn: (tx: Tx) => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction().execute(fn);
    } catch (error) {
      const code = pgErrorCode(error);
      if (!code || !RETRYABLE.has(code) || attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt + randomInt(0, 25)));
    }
  }
}
