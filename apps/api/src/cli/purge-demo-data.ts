import type pg from 'pg';

export interface PurgeOptions {
  /** Organizations to remove with everything under them (venues, bookings, media rows, audit...). */
  readonly orgSlugs: readonly string[];
  /** Users to remove by phone (e.g. the demo owner), unless they still belong to another organization. */
  readonly userPhones: readonly string[];
  /** Also remove every non-staff user who is not a member of an organization (staging testers). */
  readonly allPlayers: boolean;
  /** Allow `allPlayers` to delete bookings those players made at venues that are being kept. */
  readonly force: boolean;
  /** Roll back at the end and only report the counts. */
  readonly dryRun: boolean;
}

export interface PurgeResult {
  readonly deleted: Record<string, number>;
  /** Storage keys of removed photos; delete the files after the transaction commits. */
  readonly mediaKeys: string[];
  readonly committed: boolean;
}

export class PurgeRefusedError extends Error {
  override readonly name = 'PurgeRefusedError';
}

interface ForeignKey {
  child: string;
  column: string;
  parent: string;
  parentColumn: string;
}

async function foreignKeys(client: pg.PoolClient): Promise<Map<string, ForeignKey[]>> {
  const { rows } = await client.query<ForeignKey>(`
    SELECT c.conrelid::regclass::text AS child, ca.attname AS column,
           c.confrelid::regclass::text AS parent, pa.attname AS "parentColumn"
      FROM pg_constraint c
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
       AND c.connamespace::regnamespace::text NOT IN ('pg_catalog', 'information_schema')`);
  const byParent = new Map<string, ForeignKey[]>();
  for (const fk of rows) byParent.set(fk.parent, [...(byParent.get(fk.parent) ?? []), fk]);
  return byParent;
}

/**
 * Deletes rows of `table` matching `where` after first deleting every row that references them,
 * following the foreign keys found in the database (so a table added later is never missed).
 */
async function deleteCascade(
  client: pg.PoolClient,
  fks: Map<string, ForeignKey[]>,
  table: string,
  where: string,
  params: unknown[],
  counts: Record<string, number>,
  path: readonly string[] = [],
): Promise<void> {
  for (const fk of fks.get(table) ?? []) {
    if (path.includes(fk.child) || fk.child === table) continue;
    await deleteCascade(
      client,
      fks,
      fk.child,
      `${fk.column} IN (SELECT ${fk.parentColumn} FROM ${table} WHERE ${where})`,
      params,
      counts,
      [...path, table],
    );
  }
  const r = await client.query(`DELETE FROM ${table} WHERE ${where}`, params);
  counts[table] = (counts[table] ?? 0) + (r.rowCount ?? 0);
}

/**
 * Removes demo/staging data before real launch. Needs the table-owner (migration) role: it lifts
 * the append-only triggers (audit log, booking status history, balance ledger) for this one
 * transaction only, and puts them back before it ends.
 */
export async function purgeDemoData(pool: pg.Pool, options: PurgeOptions): Promise<PurgeResult> {
  const client = await pool.connect();
  const counts: Record<string, number> = {};
  const mediaKeys: string[] = [];
  try {
    await client.query('BEGIN');
    // Row-level security applies to the table owner too (FORCE); this is the platform-level bypass.
    await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const fks = await foreignKeys(client);
    const triggers = await client.query<{ tbl: string; name: string }>(`
      SELECT t.tgrelid::regclass::text AS tbl, t.tgname AS name
        FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE NOT t.tgisinternal AND p.proname = 'reject_modification'`);
    for (const t of triggers.rows)
      await client.query(`ALTER TABLE ${t.tbl} DISABLE TRIGGER "${t.name}"`);

    const orgSlugs = [...options.orgSlugs];
    const orgWhere = `slug = ANY($1::text[])`;

    const media = await client.query<{ storage_key: string }>(
      `SELECT m.storage_key FROM venue.media m JOIN venue.venues v ON v.id = m.venue_id
         JOIN tenancy.organizations o ON o.id = v.organization_id WHERE o.slug = ANY($1::text[])`,
      [orgSlugs],
    );
    mediaKeys.push(...media.rows.map((m) => m.storage_key));

    // Queued notifications about the removed bookings (no foreign key from the outbox).
    await deleteCascade(
      client,
      fks,
      'platform.outbox_events',
      `payload->>'bookingId' IN (SELECT b.id::text FROM booking.bookings b
         JOIN tenancy.organizations o ON o.id = b.organization_id WHERE o.slug = ANY($1::text[]))`,
      [orgSlugs],
      counts,
    );
    await deleteCascade(client, fks, 'tenancy.organizations', orgWhere, [orgSlugs], counts);

    const userWhere = `phone = ANY($1::text[])
      AND id NOT IN (SELECT user_id FROM tenancy.memberships)
      AND id NOT IN (SELECT user_id FROM identity.password_credentials)`;
    await client.query(`DELETE FROM identity.otp_challenges WHERE phone = ANY($1::text[])`, [
      [...options.userPhones],
    ]);
    await deleteCascade(
      client,
      fks,
      'identity.users',
      userWhere,
      [[...options.userPhones]],
      counts,
    );

    if (options.allPlayers) {
      const players = `id NOT IN (SELECT user_id FROM tenancy.memberships)
        AND id NOT IN (SELECT user_id FROM identity.password_credentials)`;
      const real = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM booking.bookings WHERE customer_user_id IN (SELECT id FROM identity.users WHERE ${players})`,
      );
      if (Number(real.rows[0]!.n) > 0 && !options.force) {
        throw new PurgeRefusedError(
          `${real.rows[0]!.n} bookings by players at venues that are being kept would be deleted; ` +
            'run again with --force if that is intended (never after real customers exist).',
        );
      }
      await deleteCascade(client, fks, 'identity.users', players, [], counts);
      await client.query('DELETE FROM identity.otp_challenges');
    }

    for (const t of triggers.rows)
      await client.query(`ALTER TABLE ${t.tbl} ENABLE TRIGGER "${t.name}"`);
    if (options.dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
    return {
      deleted: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)),
      mediaKeys,
      committed: !options.dryRun,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
