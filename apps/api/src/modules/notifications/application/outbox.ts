import type { DbOrTx } from '../../../platform/database/database.js';
import { uuidv7 } from '../../../platform/database/ids.js';

export type OutboxEvent =
  | { type: 'booking.confirmed'; payload: { bookingId: string } }
  | {
      type: 'booking.cancelled';
      payload: { bookingId: string; by: 'customer' | 'venue' | 'admin' | 'system' };
    }
  // CliQ payments and the commission balance (plan §4–§5). No SMS/WhatsApp channel is connected
  // yet: these are recorded so the same events drive notifications once a provider is chosen.
  | { type: 'payment.submitted'; payload: { bookingId: string; paymentId: string } }
  | { type: 'payment.rejected'; payload: { bookingId: string; paymentId: string } }
  | { type: 'dispute.opened'; payload: { disputeId: string; bookingId: string } }
  | { type: 'refund.due'; payload: { bookingId: string; paymentId: string } }
  | { type: 'balance.low'; payload: { organizationId: string; balance: number } }
  | { type: 'balance.empty'; payload: { organizationId: string; balance: number } };

/** Writes an event in the caller's transaction (ADR-0007): it exists if and only if the change committed. */
export async function enqueue(tx: DbOrTx, event: OutboxEvent): Promise<void> {
  await tx
    .insertInto('platform.outbox_events')
    .values({ id: uuidv7(), type: event.type, payload: JSON.stringify(event.payload) })
    .execute();
}
