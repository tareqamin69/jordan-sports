import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDotEnv, parseConfig } from '../platform/config/config.js';
import { archiveDemoData } from './archive-demo-data.js';

/**
 * One-command launch cleanup: soft-archives all demo organizations, venues and users (docs/
 * launch-checklist.md). Dry run unless --yes. Nothing is deleted, every change is audited, and it
 * is safe to run again.
 *
 *   node dist/cli/launch-cleanup.js          # show what would be archived
 *   node dist/cli/launch-cleanup.js --yes    # do it
 *
 * Needs DATABASE_URL of the migration (owner) role. Staff accounts and real venues are never
 * touched; to delete demo data for good use remove-demo.js instead.
 */
async function main(): Promise<number> {
  const { values } = parseArgs({ options: { yes: { type: 'boolean', default: false } } });
  loadDotEnv();
  const config = parseConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    const r = await archiveDemoData(pool, { dryRun: !values.yes });
    console.log(
      [
        `organizations suspended: ${r.organizations}`,
        `venues archived: ${r.venues}`,
        `upcoming bookings cancelled: ${r.cancelledBookings}`,
        `demo users suspended: ${r.users}`,
      ].join('\n'),
    );
    console.log(
      r.committed
        ? '\nDone. Every change is in the audit log (launch.cleanup_completed).'
        : '\nDry run: nothing was changed. Add --yes to apply.',
    );
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
