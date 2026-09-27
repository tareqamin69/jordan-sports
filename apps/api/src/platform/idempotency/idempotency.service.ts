import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { sha256Hex } from '../security/crypto.js';
import { AppError } from '../http/errors.js';

const STALE_MS = 60_000;

export interface StoredResponse<T> {
  status: number;
  body: T;
}

/**
 * Idempotency keys for booking requests (docs/architecture.md §G/§N). The first request with a key
 * runs; repeats with the same payload get the stored response; the same key with a different
 * payload is rejected. Expected (AppError) failures are stored too, so a retry sees the same answer.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  static hash(parts: unknown): string {
    return sha256Hex(JSON.stringify(parts));
  }

  async run<T>(
    userId: string,
    key: string | undefined,
    requestHash: string,
    fn: () => Promise<StoredResponse<T>>,
  ): Promise<StoredResponse<T>> {
    if (!key || key.length < 8 || key.length > 100)
      throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 400);

    for (let attempt = 0; attempt < 2; attempt++) {
      const inserted = await this.db
        .insertInto('platform.idempotency_keys')
        .values({ user_id: userId, key, request_hash: requestHash, status: 'in_progress' })
        .onConflict((oc) => oc.columns(['user_id', 'key']).doNothing())
        .executeTakeFirst();
      if (Number(inserted.numInsertedOrUpdatedRows ?? 0n) === 1) break;

      const existing = await this.db
        .selectFrom('platform.idempotency_keys')
        .selectAll()
        .where('user_id', '=', userId)
        .where('key', '=', key)
        .executeTakeFirst();
      if (!existing) continue;
      if (existing.request_hash !== requestHash) throw new AppError('IDEMPOTENCY_KEY_REUSED', 422);
      if (existing.status === 'completed') {
        return { status: existing.response_status ?? 200, body: existing.response_body as T };
      }
      if (Date.now() - existing.created_at.getTime() < STALE_MS)
        throw new AppError('REQUEST_IN_PROGRESS', 409);
      // An abandoned attempt (e.g. a crash): take it over.
      await this.db
        .deleteFrom('platform.idempotency_keys')
        .where('user_id', '=', userId)
        .where('key', '=', key)
        .execute();
    }

    try {
      const response = await fn();
      await this.complete(userId, key, response.status, response.body);
      return response;
    } catch (error) {
      if (error instanceof AppError) {
        await this.complete(userId, key, error.status, {
          __error: { code: error.code, status: error.status, detail: error.detail ?? null },
        });
      } else {
        await this.db
          .deleteFrom('platform.idempotency_keys')
          .where('user_id', '=', userId)
          .where('key', '=', key)
          .execute();
      }
      throw error;
    }
  }

  private async complete(
    userId: string,
    key: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    await this.db
      .updateTable('platform.idempotency_keys')
      .set({ status: 'completed', response_status: status, response_body: JSON.stringify(body) })
      .where('user_id', '=', userId)
      .where('key', '=', key)
      .execute();
  }
}

/** Re-raises a stored expected error so repeats of a failed request fail the same way. */
export function unwrapStored<T>(response: StoredResponse<T>): T {
  const body = response.body as unknown as {
    __error?: { code: string; status: number; detail: string | null };
  };
  if (body && typeof body === 'object' && body.__error) {
    const e = body.__error;
    throw new AppError(e.code as never, e.status, e.detail ?? undefined);
  }
  return response.body;
}
