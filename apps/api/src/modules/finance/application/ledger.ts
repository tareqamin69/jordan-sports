import type { Tx } from '../../../platform/database/database.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { enqueue } from '../../notifications/index.js';
import { LOW_BALANCE_THRESHOLD } from '../domain/finance-rules.js';

export type EntryKind = 'topup' | 'commission' | 'commission_reversal' | 'adjustment';

export interface EntryInput {
  readonly organizationId: string;
  readonly kind: EntryKind;
  /** Signed minor units: positive credits the balance, negative debits it. */
  readonly amount: number;
  readonly currency: string;
  readonly bookingId?: string | null;
  readonly reason?: string | null;
  readonly createdBy?: string | null;
}

export interface PostedEntry {
  readonly id: string;
  readonly before: number;
  readonly after: number;
}

/**
 * Appends a ledger entry and moves the cached balance in the caller's transaction (ADR-0006). The
 * balance row is locked first, so concurrent postings for one organization serialize. Booking
 * entries are idempotent: a second commission (or reversal) for the same booking posts nothing and
 * returns null. The caller sets the tenant (or bypasses) for row-level security.
 */
export async function postEntry(tx: Tx, input: EntryInput): Promise<PostedEntry | null> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
    throw new Error('Ledger amount must be a non-zero safe integer');
  }
  await tx
    .insertInto('finance.balances')
    .values({ organization_id: input.organizationId, currency: input.currency })
    .onConflict((oc) => oc.column('organization_id').doNothing())
    .execute();
  const row = await tx
    .selectFrom('finance.balances')
    .select(['balance', 'currency'])
    .where('organization_id', '=', input.organizationId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (row.currency !== input.currency) throw new Error('Ledger currency mismatch');
  const before = Number(row.balance);
  const after = before + input.amount;
  const id = uuidv7();
  const inserted = await tx
    .insertInto('finance.balance_entries')
    .values({
      id,
      organization_id: input.organizationId,
      kind: input.kind,
      amount: String(input.amount),
      currency: input.currency,
      balance_after: String(after),
      booking_id: input.bookingId ?? null,
      reason: input.reason ?? null,
      created_by: input.createdBy ?? null,
    })
    .onConflict((oc) =>
      oc.columns(['booking_id', 'kind']).where('booking_id', 'is not', null).doNothing(),
    )
    .returning('id')
    .executeTakeFirst();
  if (!inserted) return null;
  await tx
    .updateTable('finance.balances')
    .set({ balance: String(after), updated_at: new Date() })
    .where('organization_id', '=', input.organizationId)
    .execute();

  // Crossing into "low" or "empty" is announced once (a future SMS/WhatsApp channel sends it).
  if (after <= 0 && before > 0) {
    await enqueue(tx, {
      type: 'balance.empty',
      payload: { organizationId: input.organizationId, balance: after },
    });
  } else if (after < LOW_BALANCE_THRESHOLD && before >= LOW_BALANCE_THRESHOLD) {
    await enqueue(tx, {
      type: 'balance.low',
      payload: { organizationId: input.organizationId, balance: after },
    });
  }
  return { id, before, after };
}

/** Charges the booking's commission once (plan §5). Zero commission posts nothing. */
export async function chargeCommission(
  tx: Tx,
  booking: { id: string; organizationId: string; commission: number; currency: string },
): Promise<PostedEntry | null> {
  if (booking.commission <= 0) return null;
  return postEntry(tx, {
    organizationId: booking.organizationId,
    kind: 'commission',
    amount: -booking.commission,
    currency: booking.currency,
    bookingId: booking.id,
  });
}

/**
 * Returns a booking's commission to the balance (venue cancelled, or the player cancelled in the
 * free window: plan D3). Does nothing when no commission was charged or it was already returned.
 */
export async function reverseCommission(tx: Tx, bookingId: string): Promise<PostedEntry | null> {
  const charged = await tx
    .selectFrom('finance.balance_entries')
    .select(['organization_id', 'amount', 'currency'])
    .where('booking_id', '=', bookingId)
    .where('kind', '=', 'commission')
    .executeTakeFirst();
  if (!charged) return null;
  return postEntry(tx, {
    organizationId: charged.organization_id,
    kind: 'commission_reversal',
    amount: -Number(charged.amount),
    currency: charged.currency,
    bookingId,
  });
}
