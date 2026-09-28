import { sql, type Expression, type SqlBool } from 'kysely';
import type { DbOrTx } from '../../../platform/database/database.js';

/**
 * Whether a venue can take new online bookings and appear in search (plan §5 D4, D2 escalation).
 * Only venues that take CliQ are gated: pay-at-venue venues have no commission to prepay. With
 * CliQ payments switched off (FEATURE_CLIQ_PAYMENTS) no venue is gated.
 */
export async function takesOnlineBookings(
  db: DbOrTx,
  venue: { readonly organizationId: string; readonly cliqAlias: string | null },
  cliqEnabled: boolean,
  now = new Date(),
): Promise<boolean> {
  if (!cliqEnabled || !venue.cliqAlias) return true;
  const r = await sql<{ ok: boolean }>`
    SELECT finance.org_takes_online_bookings(${venue.organizationId}::uuid, ${now.toISOString()}::timestamptz) AS ok
  `.execute(db);
  return r.rows[0]?.ok ?? false;
}

/** The same rule as a filter for `venue.venues` aliased `v` in public queries. */
export function takesOnlineBookingsFilter(
  cliqEnabled: boolean,
  now = new Date(),
): Expression<SqlBool> {
  if (!cliqEnabled) return sql<SqlBool>`true`;
  return sql<SqlBool>`(v.cliq_alias IS NULL OR finance.org_takes_online_bookings(v.organization_id, ${now.toISOString()}::timestamptz))`;
}
