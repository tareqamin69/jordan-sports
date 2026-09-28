import pg from 'pg';
import { loadDotEnv, parseConfig } from '../platform/config/config.js';
import { preflightChecks } from './preflight-checks.js';

/**
 * Go-live check (docs/production.md): exit 0 only when the configuration is in production mode and
 * the database holds no demo data or test accounts. Needs DATABASE_URL of the owner role.
 */
async function main(): Promise<number> {
  loadDotEnv();
  const config = parseConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    const checks = await preflightChecks(config, pool);
    for (const c of checks)
      console.log(
        `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${!c.ok && c.detail ? ` (${c.detail})` : ''}`,
      );
    const failed = checks.filter((c) => !c.ok).length;
    console.log(
      failed === 0 ? '\nReady for real customers.' : `\n${failed} check(s) failed. Not ready.`,
    );
    return failed === 0 ? 0 : 1;
  } finally {
    await pool.end();
  }
}

process.exit(await main());
