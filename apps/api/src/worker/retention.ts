import { sql } from 'kysely';
import type { Db } from '../platform/database/database.js';
import { transaction } from '../platform/database/transaction.js';

/** Sign-in codes (with the phone they were sent to) are kept this long, then deleted. */
export const OTP_RETENTION_DAYS = 7;
/** Ended sessions keep their IP address and browser this long (security reviews), then lose them. */
export const SESSION_DETAILS_RETENTION_DAYS = 90;

/**
 * Data minimisation (PDPL; docs/compliance-checklist.md): removes personal details nobody needs
 * any more. Idempotent; returns how many rows changed.
 */
export async function purgeExpiredPersonalData(db: Db): Promise<number> {
  return transaction(db, async (tx) => {
    const otps = await tx
      .deleteFrom('identity.otp_challenges')
      .where(sql<boolean>`created_at < now() - make_interval(days => ${OTP_RETENTION_DAYS})`)
      .executeTakeFirst();
    const sessions = await tx
      .updateTable('identity.sessions')
      .set({ ip: null, user_agent: null })
      .where((eb) => eb.or([eb('ip', 'is not', null), eb('user_agent', 'is not', null)]))
      .where(
        sql<boolean>`coalesce(revoked_at, expires_at) < now() - make_interval(days => ${SESSION_DETAILS_RETENTION_DAYS})`,
      )
      .executeTakeFirst();
    return Number(otps.numDeletedRows) + Number(sessions.numUpdatedRows);
  });
}
