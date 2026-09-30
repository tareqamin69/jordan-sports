import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { preflightChecks } from '../../src/cli/preflight-checks.js';
import { AuthService } from '../../src/modules/identity/index.js';
import { parseConfig, type AppConfig } from '../../src/platform/config/config.js';
import {
  createOrganization,
  createTestApp,
  createVenue,
  signInAdmin,
  type TestApp,
} from '../support/app.js';

// No real card gateway exists yet (ADR-0020), so a launch configuration cannot be parsed: build
// it as staging and switch staging off afterwards. The gateway check is then the one that fails.
const GATEWAY = 'a real card payment gateway is configured (not the test-card mock)';
const productionConfig = (t: TestApp, extra: Record<string, string> = {}): AppConfig => {
  const staging = extra.STAGING === 'true';
  const config = parseConfig({
    NODE_ENV: 'production',
    DATABASE_URL: t.config.databaseUrl,
    REDIS_URL: t.config.redisUrl,
    AUTH_SECRET: t.config.authSecret,
    WEB_ORIGINS: 'https://jorena.app',
    ADMIN_ORIGINS: 'https://admin.jorena.app',
    OTP_CHANNEL: 'releans',
    RELEANS_API_KEY: 'key-12345678',
    ...extra,
    STAGING: 'true',
  });
  return { ...config, staging };
};

const failing = async (t: TestApp, config: AppConfig) =>
  (await preflightChecks(config, t.ownerPool)).filter((c) => !c.ok).map((c) => c.name);

describe('go-live preflight', () => {
  let clean: TestApp;
  let dirty: TestApp;

  beforeAll(async () => {
    clean = await createTestApp();
    dirty = await createTestApp();
    // Clean: only a real staff account.
    await clean.app.get(AuthService).createPlatformUser({
      email: 'owner@jorena.app',
      displayName: 'Owner',
      password: randomUUID() + randomUUID(),
      role: 'owner',
    });
    // Dirty: a test staff account, plus a demo organization and venue.
    const admin = await signInAdmin(dirty.app);
    const org = await createOrganization(dirty.app, admin.cookie);
    await createVenue(dirty.app, admin.cookie, org.id, { slug: 'demo-padel-club', approve: true });
  });
  afterAll(async () => {
    await clean?.close();
    await dirty?.close();
  });

  it('passes when configured for production with real staff and no demo data — except the gateway', async () => {
    // Everything else is ready; Jorena launches only once the card gateway is live.
    expect(await failing(clean, productionConfig(clean))).toEqual([GATEWAY]);
  });

  it('fails on demo venues and test staff accounts', async () => {
    const failed = await failing(dirty, productionConfig(dirty));
    expect(failed).toEqual([GATEWAY, 'no demo venues', 'no test staff accounts']);
  });

  it('fails when the server is still in staging or test mode', async () => {
    const staging = productionConfig(clean, {
      STAGING: 'true',
      OTP_CHANNEL: 'console',
      WEB_ORIGINS: 'https://1-2-3-4.sslip.io',
      ADMIN_ORIGINS: 'https://admin.1-2-3-4.sslip.io',
    });
    expect(await failing(clean, staging)).toEqual([
      'staging mode is off (no on-screen sign-in codes)',
      'sign-in codes go out by SMS (OTP_CHANNEL=releans)',
      GATEWAY,
      'origins are https on a real domain',
    ]);
    const development = parseConfig({
      NODE_ENV: 'development',
      DATABASE_URL: clean.config.databaseUrl,
      REDIS_URL: clean.config.redisUrl,
      AUTH_SECRET: clean.config.authSecret,
    });
    expect(await failing(clean, development)).toContain('NODE_ENV is production');
  });

  it('fails when nobody can approve venues (no staff with an authenticator)', async () => {
    const empty = await createTestApp();
    try {
      expect(await failing(empty, productionConfig(empty))).toEqual([
        GATEWAY,
        'at least one staff account with an authenticator',
      ]);
    } finally {
      await empty.close();
    }
  });
});
