import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { transaction } from '../../../platform/database/transaction.js';
import { expireHolds, recordStatus } from './booking-store.js';

/** Time-driven booking transitions run by the worker (idempotent; safe with several workers). */
@Injectable()
export class LifecycleService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  /** HELD → EXPIRED for holds past their expiry; frees their time. */
  async expireHolds(now = new Date()): Promise<number> {
    const ids = await transaction(this.db, (tx) => expireHolds(tx, now));
    return ids.length;
  }

  /** CONFIRMED → COMPLETED once a booking has ended. */
  async completeFinished(now = new Date()): Promise<number> {
    return transaction(this.db, async (tx) => {
      const done = await tx
        .updateTable('booking.bookings')
        .set({ status: 'COMPLETED' })
        .where(
          'id',
          'in',
          tx
            .selectFrom('booking.bookings')
            .select('id')
            .where('status', '=', 'CONFIRMED')
            .where(sql<boolean>`upper(during) <= ${now.toISOString()}::timestamptz`)
            .orderBy('id')
            .limit(500),
        )
        .where('status', '=', 'CONFIRMED')
        .returning('id')
        .execute();
      await recordStatus(
        tx,
        done.map((r) => ({
          bookingId: r.id,
          from: 'CONFIRMED' as const,
          to: 'COMPLETED' as const,
          actorType: 'system' as const,
        })),
      );
      return done.length;
    });
  }
}
