import { sql } from 'kysely';
import type { DbOrTx, Tx } from '../../../platform/database/database.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { reverseCommission } from '../../finance/index.js';
import { enqueue } from '../../notifications/index.js';
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
  await expirePayments(tx, ids);
  return ids;
}

/**
 * Closes the CliQ payments of expired holds. A player who already sent proof that the venue never
 * confirmed gets an automatic dispute (plan D1): the money may have been sent.
 */
async function expirePayments(tx: Tx, bookingIds: readonly string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  const open = await tx
    .selectFrom('payment.payments')
    .select(['id', 'booking_id', 'organization_id', 'venue_id', 'status'])
    .where('booking_id', 'in', bookingIds)
    .where('status', 'in', ['AWAITING_PROOF', 'SUBMITTED'])
    .forUpdate()
    .execute();
  if (open.length === 0) return;
  await tx
    .updateTable('payment.payments')
    .set({ status: 'EXPIRED' })
    .where(
      'id',
      'in',
      open.map((p) => p.id),
    )
    .execute();
  for (const p of open.filter((x) => x.status === 'SUBMITTED')) {
    const dispute = await tx
      .insertInto('payment.disputes')
      .values({
        id: uuidv7(),
        organization_id: p.organization_id,
        venue_id: p.venue_id,
        booking_id: p.booking_id,
        payment_id: p.id,
        kind: 'UNCONFIRMED_PAYMENT',
        opened_by_role: 'system',
      })
      .onConflict((oc) =>
        oc.columns(['payment_id', 'kind']).where('opened_by_role', '=', 'system').doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (dispute) {
      await enqueue(tx, {
        type: 'dispute.opened',
        payload: { disputeId: dispute.id, bookingId: p.booking_id },
      });
    }
  }
}

/**
 * A paid CliQ booking cancelled in a refundable way (by the venue, or by the player inside the
 * free window): the commission returns to the balance and the venue owes the deposit back (plan
 * D2, D3). The caller's transaction must have the booking's tenant set (ledger row-level security).
 */
export async function refundDeposit(tx: Tx, bookingId: string, now: Date): Promise<void> {
  const payment = await tx
    .updateTable('payment.payments')
    .set({ refund_status: 'DUE', refund_due_at: now })
    .where('booking_id', '=', bookingId)
    .where('status', '=', 'CONFIRMED')
    .where('refund_status', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!payment) return;
  await reverseCommission(tx, bookingId);
  await enqueue(tx, { type: 'refund.due', payload: { bookingId, paymentId: payment.id } });
}
