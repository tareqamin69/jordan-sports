import { randomUUID } from 'node:crypto';
import type pg from 'pg';

/** What marks demo data: the seeded organization and owner, and any name containing this tag. */
export const DEMO_ORG_SLUG = 'demo-sports-group';
export const DEMO_OWNER_PHONE = '+962790000001';
export const DEMO_NAME_TAG = '(تجريبي)';

export interface ArchiveDemoResult {
  readonly organizations: number;
  readonly venues: number;
  readonly users: number;
  readonly cancelledBookings: number;
  readonly committed: boolean;
}

export interface ArchiveDemoOptions {
  /** Report what would change and roll back (the default in the CLI). */
  readonly dryRun: boolean;
}

/**
 * Launch cleanup (QA #20): soft-archives demo data instead of deleting it, and audits every change.
 *
 * - **Organizations** whose slug is the seeded demo organization, or whose name contains "(تجريبي)",
 *   are suspended.
 * - **Venues** of those organizations, and any venue whose name contains the tag, are archived
 *   (hidden everywhere, rows kept). Their upcoming held/confirmed bookings are cancelled first
 *   (reason "Demo data cleanup", no message is sent to anyone).
 * - **Users**: the seeded demo owner and users whose name contains the tag are suspended and signed
 *   out, unless they are platform staff or belong to an organization that is not being archived.
 *
 * Everything runs in one transaction; `dryRun` rolls it back after counting.
 */
export async function archiveDemoData(
  pool: pg.Pool,
  options: ArchiveDemoOptions,
): Promise<ArchiveDemoResult> {
  const client = await pool.connect();
  const like = `%${DEMO_NAME_TAG}%`;
  try {
    await client.query('BEGIN');
    // Owner-role connection: bypass row-level security, like the other maintenance commands.
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)").catch(() => undefined);

    const audit = async (
      action: string,
      targetType: string,
      targetId: string,
      organizationId: string | null,
      details: Record<string, unknown>,
    ) => {
      await client.query(
        `INSERT INTO audit.audit_logs
           (id, actor_type, action, target_type, target_id, organization_id, reason, details)
         VALUES ($1, 'system', $2, $3, $4, $5, 'Launch cleanup: demo data', $6)`,
        [randomUUID(), action, targetType, targetId, organizationId, JSON.stringify(details)],
      );
    };

    // Organizations.
    const orgs = await client.query<{ id: string }>(
      `UPDATE tenancy.organizations
          SET status = 'suspended'
        WHERE (slug = $1 OR name::text LIKE $2) AND status <> 'suspended'
        RETURNING id`,
      [DEMO_ORG_SLUG, like],
    );
    for (const o of orgs.rows) {
      await audit('organization.suspended', 'organization', o.id, o.id, {
        before: { status: 'active' },
        after: { status: 'suspended' },
        cause: 'launch_cleanup',
      });
    }

    // Venues to archive: of any demo organization (including ones suspended earlier) or tagged.
    const venues = await client.query<{ id: string; organization_id: string }>(
      `SELECT v.id, v.organization_id
         FROM venue.venues v
         JOIN tenancy.organizations o ON o.id = v.organization_id
        WHERE v.archived_at IS NULL
          AND (o.slug = $1 OR o.name::text LIKE $2 OR v.name::text LIKE $2)
        FOR UPDATE OF v`,
      [DEMO_ORG_SLUG, like],
    );
    const venueIds = venues.rows.map((v) => v.id);
    let cancelled = 0;
    if (venueIds.length > 0) {
      const bookings = await client.query<{ id: string; status: string }>(
        `UPDATE booking.bookings
            SET status = 'CANCELLED', cancelled_at = now(), cancelled_by_role = 'system',
                cancel_reason = 'Demo data cleanup', late_cancellation = NULL
          WHERE venue_id = ANY($1) AND status IN ('HELD', 'CONFIRMED') AND upper(during) > now()
          RETURNING id, status`,
        [venueIds],
      );
      cancelled = bookings.rowCount ?? 0;
      const ids = bookings.rows.map((b) => b.id);
      if (ids.length > 0) {
        await client.query(
          `UPDATE scheduling.occupancies SET active = false WHERE booking_id = ANY($1) AND active`,
          [ids],
        );
        await client.query(
          `INSERT INTO booking.status_history (id, booking_id, from_status, to_status, actor_type, reason)
           SELECT gen_random_uuid(), b, NULL, 'CANCELLED', 'system', 'Demo data cleanup'
             FROM unnest($1::uuid[]) AS b`,
          [ids],
        );
      }
      await client.query('UPDATE venue.venues SET archived_at = now() WHERE id = ANY($1)', [
        venueIds,
      ]);
      for (const v of venues.rows) {
        await audit('venue.archived', 'venue', v.id, v.organization_id, {
          before: { archivedAt: null },
          after: { archivedAt: 'now' },
          cause: 'launch_cleanup',
        });
      }
    }

    // Users: the demo owner and tagged users, never staff or members of a kept organization.
    const users = await client.query<{ id: string }>(
      `UPDATE identity.users u
          SET status = 'suspended'
        WHERE (u.phone = $1 OR u.display_name LIKE $2)
          AND u.status = 'active'
          AND u.platform_role IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM tenancy.memberships m
              JOIN tenancy.organizations o ON o.id = m.organization_id
             WHERE m.user_id = u.id AND o.status = 'active')
        RETURNING u.id`,
      [DEMO_OWNER_PHONE, like],
    );
    if (users.rows.length > 0) {
      await client.query(
        `UPDATE identity.sessions SET revoked_at = now()
          WHERE user_id = ANY($1) AND revoked_at IS NULL`,
        [users.rows.map((u) => u.id)],
      );
    }
    for (const u of users.rows) {
      await audit('user.suspended', 'user', u.id, null, {
        before: { status: 'active' },
        after: { status: 'suspended' },
        cause: 'launch_cleanup',
      });
    }

    const result = {
      organizations: orgs.rowCount ?? 0,
      venues: venueIds.length,
      users: users.rowCount ?? 0,
      cancelledBookings: cancelled,
    };
    if (options.dryRun) {
      await client.query('ROLLBACK');
      return { ...result, committed: false };
    }
    await audit('launch.cleanup_completed', 'platform', 'demo-data', null, result);
    await client.query('COMMIT');
    return { ...result, committed: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
