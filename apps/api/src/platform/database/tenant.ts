import { sql } from 'kysely';
import type { Tx } from './database.js';

/**
 * Row-level security context (ADR-0008). Tenant-private tables (e.g. booking.venue_customers)
 * only return or accept rows of the organization set here, for the rest of the transaction.
 */
export async function setTenant(tx: Tx, organizationId: string): Promise<void> {
  await sql`SELECT set_config('app.org_id', ${organizationId}, true)`.execute(tx);
}

/**
 * Explicit, auditable bypass for platform-level reads and system jobs (admin screens, worker).
 * Scoped to the current transaction only.
 */
export async function bypassTenant(tx: Tx): Promise<void> {
  await sql`SELECT set_config('app.bypass_rls', 'on', true)`.execute(tx);
}
