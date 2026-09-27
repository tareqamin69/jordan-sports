import type { DbOrTx } from '../../../platform/database/database.js';
import { uuidv7 } from '../../../platform/database/ids.js';

export type OutboxEvent =
  | { type: 'booking.confirmed'; payload: { bookingId: string } }
  | {
      type: 'booking.cancelled';
      payload: { bookingId: string; by: 'customer' | 'venue' | 'admin' | 'system' };
    };

/** Writes an event in the caller's transaction (ADR-0007): it exists if and only if the change committed. */
export async function enqueue(tx: DbOrTx, event: OutboxEvent): Promise<void> {
  await tx
    .insertInto('platform.outbox_events')
    .values({ id: uuidv7(), type: event.type, payload: JSON.stringify(event.payload) })
    .execute();
}
