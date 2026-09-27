import { sql } from 'kysely';
import type { DbOrTx, Tx } from '../../../platform/database/database.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { tstzrange, type Interval } from '../../scheduling/index.js';
import type { BookingStatus } from '../domain/booking-rules.js';

export type ActorType = 'customer' | 'venue' | 'admin' | 'system';

/** Low-level booking writes shared by the player, venue and system flows. */
export async function recordStatus(
  tx: DbOrTx,
  entries: ReadonlyArray<{
    bookingId: string;
    from: BookingStatus | null;
    to: BookingStatus;
    actorType: ActorType;
    actorUserId?: string | null;
    reason?: string | null;
  }>,
): Promise<void> {
  if (entries.length === 0) return;
  await tx
    .insertInto('booking.status_history')
    .values(
      entries.map((e) => ({
        id: uuidv7(),
        booking_id: e.bookingId,
        from_status: e.from,
        to_status: e.to,
        actor_type: e.actorType,
        actor_user_id: e.actorUserId ?? null,
        reason: e.reason ?? null,
      })),
    )
    .execute();
}

export async function releaseOccupancies(tx: Tx, bookingIds: readonly string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  await tx
    .updateTable('scheduling.occupancies')
    .set({ active: false })
    .where('booking_id', 'in', bookingIds)
    .where('active', '=', true)
    .execute();
}

/**
 * Marks holds past their expiry as EXPIRED and frees their time. With `scope`, only holds on those
 * units overlapping the interval (done inside a new hold's transaction so a stale hold never blocks
 * the exclusion constraint); without it, every expired hold (the worker's sweep).
 */
export async function expireHolds(
  tx: Tx,
  now: Date,
  scope?: { unitIds: readonly string[]; during: Interval },
): Promise<string[]> {
  let stale = tx
    .selectFrom('booking.bookings as b')
    .select('b.id')
    .where('b.status', '=', 'HELD')
    .where('b.hold_expires_at', '<=', now);
  if (scope) {
    stale = stale.where((eb) =>
      eb.exists(
        eb
          .selectFrom('scheduling.occupancies as o')
          .select(sql`1`.as('one'))
          .whereRef('o.booking_id', '=', 'b.id')
          .where('o.active', '=', true)
          .where('o.unit_id', 'in', scope.unitIds)
          .where(sql<boolean>`o.during && ${tstzrange(scope.during)}`),
      ),
    );
  }
  const expired = await tx
    .updateTable('booking.bookings')
    .set({ status: 'EXPIRED', hold_expires_at: null })
    .where('id', 'in', stale.orderBy('b.id').limit(500))
    .where('status', '=', 'HELD')
    .returning('id')
    .execute();
  const ids = expired.map((r) => r.id);
  await releaseOccupancies(tx, ids);
  await recordStatus(
    tx,
    ids.map((bookingId) => ({ bookingId, from: 'HELD', to: 'EXPIRED', actorType: 'system' })),
  );
  return ids;
}
