import type { Tx } from '../../../platform/database/database.js';
import { uuidv7 } from '../../../platform/database/ids.js';

export type ConsentKind = 'terms' | 'marketing_opt_in' | 'marketing_opt_out' | 'adult_payment';

/** Records a consent given or withdrawn (append-only: what, which text version, when). */
export async function recordConsent(
  tx: Tx,
  consent: {
    userId: string;
    kind: ConsentKind;
    version?: string | null;
    bookingId?: string | null;
  },
): Promise<void> {
  await tx
    .insertInto('identity.consents')
    .values({
      id: uuidv7(),
      user_id: consent.userId,
      kind: consent.kind,
      version: consent.version ?? null,
      booking_id: consent.bookingId ?? null,
    })
    .execute();
}
