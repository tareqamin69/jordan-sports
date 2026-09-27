import { parseConfig, loadDotEnv } from '../config/config.js';
import { createPool } from './database.js';
import { Migrator } from './migrator.js';

/** Usage: `node dist/platform/database/cli.js <migrate|status>` */
async function main(): Promise<number> {
  const command = process.argv[2];
  if (command !== 'migrate' && command !== 'status') {
    console.error('Usage: cli.js <migrate|status>');
    return 2;
  }

  loadDotEnv();
  const config = parseConfig(process.env);
  const pool = createPool({ connectionString: config.databaseUrl, max: 1 });
  const migrator = new Migrator({ pool, log: (message) => console.log(message) });

  try {
    if (command === 'migrate') {
      const applied = await migrator.migrate();
      console.log(
        applied.length === 0
          ? 'Database is up to date.'
          : `Applied ${applied.length} migration(s).`,
      );
      return 0;
    }

    const plan = await migrator.plan();
    console.log(`pending:      ${plan.pending.map((m) => m.name).join(', ') || '-'}`);
    console.log(`modified:     ${plan.modified.join(', ') || '-'}`);
    console.log(`out of order: ${plan.outOfOrder.join(', ') || '-'}`);
    console.log(`unknown:      ${plan.unknown.join(', ') || '-'}`);
    const clean =
      plan.pending.length === 0 && plan.modified.length === 0 && plan.outOfOrder.length === 0;
    return clean ? 0 : 1;
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
