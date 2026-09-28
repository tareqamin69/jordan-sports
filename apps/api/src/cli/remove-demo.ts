import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDotEnv, parseConfig } from '../platform/config/config.js';
import { FilesystemMediaStorage } from '../platform/storage/media-storage.js';
import { PurgeRefusedError, purgeDemoData } from './purge-demo-data.js';

/**
 * Removes the demo organization (all its venues, bookings, photos, audit entries) and the demo
 * owner before real launch. Dry run unless --yes. Needs DATABASE_URL of the migration (owner)
 * role, not the restricted application role.
 *
 *   node dist/cli/remove-demo.js                 # show what would be deleted
 *   node dist/cli/remove-demo.js --yes           # delete it
 *   node dist/cli/remove-demo.js --yes --all-players   # also every tester account (staging)
 *
 * Staff accounts and organizations other than the demo one are never touched.
 */
const DEMO_ORG_SLUG = 'demo-sports-group';
const DEMO_OWNER_PHONE = '+962790000001';

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      yes: { type: 'boolean', default: false },
      'all-players': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  loadDotEnv();
  const config = parseConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    const result = await purgeDemoData(pool, {
      orgSlugs: [DEMO_ORG_SLUG],
      userPhones: [DEMO_OWNER_PHONE],
      allPlayers: values['all-players'],
      force: values.force,
      dryRun: !values.yes,
    });
    const rows = Object.entries(result.deleted);
    console.log(rows.length ? rows.map(([t, n]) => `${t}: ${n}`).join('\n') : 'Nothing to delete.');
    if (!result.committed) {
      console.log('\nDry run: nothing was deleted. Add --yes to delete.');
      return 0;
    }
    const storage = new FilesystemMediaStorage(config.mediaDir);
    for (const key of result.mediaKeys) await storage.delete(key);
    console.log(`\nDeleted. Removed ${result.mediaKeys.length} photo files.`);
    return 0;
  } catch (error) {
    if (error instanceof PurgeRefusedError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

process.exit(await main());
