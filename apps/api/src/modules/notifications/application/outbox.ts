import type { DbOrTx } from '../../../platform/database/database.js';
import { uuidv7 } from '../../../platform/database/ids.js';

export type OutboxEvent =
  | { type: 'booking.confirmed'; payload: { bookingId: string } }
  | {
      type: 'booking.cancelled';
      payload: { bookingId: string; by: 'customer' | 'venue' | 'admin' | 'system' };
    }
  // Retired with CliQ (ADR-0020): no longer written; kept so old outbox rows still parse.
  | { type: 'payment.submitted'; payload: { bookingId: string; paymentId: string } }
  | { type: 'payment.rejected'; payload: { bookingId: string; paymentId: string } }
  | { type: 'dispute.opened'; payload: { disputeId: string; bookingId: string } }
  | { type: 'refund.due'; payload: { bookingId: string; paymentId: string } }
  | { type: 'balance.low'; payload: { organizationId: string; balance: number } }
  | { type: 'balance.empty'; payload: { organizationId: string; balance: number } }
  // A venue entered the review queue (new submission, or a published venue's owner edits):
  // the platform owner is told at once by email and SMS, with a link to the review page.
  | { type: 'venue.submitted'; payload: { venueId: string; cause: 'new' | 'owner_edit' } }
  // Staff security alert (docs/rbac-plan.md §6): every owner sign-in, and any staff sign-in from
  // a new device, is emailed to the account's address.
  | {
      type: 'staff.signed_in';
      payload: {
        userId: string;
        newDevice: boolean;
        ip: string | null;
        userAgent: string | null;
        at: string;
      };
    };

/** Writes an event in the caller's transaction (ADR-0007): it exists if and only if the change committed. */
export async function enqueue(tx: DbOrTx, event: OutboxEvent): Promise<void> {
  await tx
    .insertInto('platform.outbox_events')
    .values({ id: uuidv7(), type: event.type, payload: JSON.stringify(event.payload) })
    .execute();
}
