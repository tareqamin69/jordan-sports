import type pg from 'pg';
import type { AppConfig } from '../platform/config/config.js';

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

const TEST_ADDRESS = /(^|\.)sslip\.io$|^localhost$|^127\.|\.localhost$/;
const TEST_EMAIL_PATTERNS = [
  'e2e-admin-%',
  'admin-%@example.com',
  '%@example.com',
  '%@staging.test',
  '%@staging.example',
];

/**
 * Everything that must be true before real customers use the platform (docs/production.md):
 * production-mode configuration, and no demo data or test accounts left in the database.
 */
export async function preflightChecks(config: AppConfig, pool: pg.Pool): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });

  add('NODE_ENV is production', config.nodeEnv === 'production', config.nodeEnv);
  add('staging mode is off (no on-screen sign-in codes)', !config.staging);
  add(
    'sign-in codes go out by SMS (OTP_CHANNEL=releans)',
    config.otpChannel === 'releans' && config.releans !== null,
    config.otpChannel,
  );
  add(
    'a real card payment gateway is configured (not the test-card mock)',
    config.paymentGateway !== 'mock',
    config.paymentGateway,
  );
  add('cookies are secure', config.cookieSecure);
  add('rate limits are not scaled', config.rateLimitScale === 1);
  const origins = [...config.webOrigins, ...config.adminOrigins];
  add(
    'origins are https on a real domain',
    origins.every((o) => o.startsWith('https://') && !TEST_ADDRESS.test(new URL(o).hostname)),
    origins.join(', '),
  );

  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'on', false)`);
    const count = async (sql: string, params: unknown[] = []) =>
      Number((await client.query<{ n: string }>(sql, params)).rows[0]!.n);

    add(
      'no demo organization',
      (await count(
        `SELECT count(*) AS n FROM tenancy.organizations WHERE slug = 'demo-sports-group'`,
      )) === 0,
    );
    const demoVenues = await count(
      `SELECT count(*) AS n FROM venue.venues
        WHERE slug LIKE 'demo-%' OR name->>'ar' LIKE '%(تجريبي)%' OR name->>'en' ILIKE '%(demo)%'`,
    );
    add('no demo venues', demoVenues === 0, `${demoVenues} found`);
    add(
      'no demo owner account',
      (await count(`SELECT count(*) AS n FROM identity.users WHERE phone = '+962790000001'`)) === 0,
    );

    const testStaff = await client.query<{ email: string }>(
      `SELECT u.email FROM identity.users u JOIN identity.password_credentials c ON c.user_id = u.id
        WHERE u.email LIKE ANY($1::text[]) ORDER BY 1`,
      [TEST_EMAIL_PATTERNS],
    );
    add(
      'no test staff accounts',
      testStaff.rowCount === 0,
      testStaff.rows.map((r) => r.email).join(', '),
    );

    const staff = await count(
      `SELECT count(*) AS n FROM identity.password_credentials c JOIN identity.totp_credentials t ON t.user_id = c.user_id`,
    );
    add('at least one staff account with an authenticator', staff > 0, `${staff} found`);
    const noTotp = await count(
      `SELECT count(*) AS n FROM identity.password_credentials c
        WHERE NOT EXISTS (SELECT 1 FROM identity.totp_credentials t WHERE t.user_id = c.user_id)`,
    );
    add('every staff account has an authenticator', noTotp === 0, `${noTotp} without`);
  } finally {
    client.release();
  }
  return checks;
}
