import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, loadDotEnv, parseConfig } from '../../src/platform/config/config.js';

const DATABASE_URL = 'postgres://app:s3cret-value@localhost:5432/jordan_sports';
const base = {
  DATABASE_URL,
  REDIS_URL: 'redis://localhost:6379',
  AUTH_SECRET: 'a'.repeat(40),
};

describe('parseConfig', () => {
  it('applies defaults for optional variables', () => {
    expect(parseConfig(base)).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 4000,
      databaseUrl: DATABASE_URL,
      databasePoolMax: 10,
      databaseAppRole: 'js_app',
      redisUrl: 'redis://localhost:6379',
      authSecret: 'a'.repeat(40),
      webOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      adminOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001'],
      cookieSecure: false,
      otpChannel: 'console',
      mediaDir: '.data/media',
      logLevel: 'info',
    });
  });

  it('coerces numeric variables', () => {
    const config = parseConfig({ ...base, API_PORT: '8080', DATABASE_POOL_MAX: '3' });
    expect(config.port).toBe(8080);
    expect(config.databasePoolMax).toBe(3);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseConfig({ ...base, DATABASE_URL: undefined })).toThrow(ConfigError);
    expect(() => parseConfig({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid values', () => {
    expect(() => parseConfig({ ...base, API_PORT: '70000' })).toThrow(/API_PORT/);
    expect(() => parseConfig({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => parseConfig({ ...base, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('never includes variable values in error messages', () => {
    const secret = 'mysql://root:super-secret-password@db/app';
    try {
      parseConfig({ ...base, DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/DATABASE_URL/);
      expect((error as Error).message).not.toContain('super-secret-password');
    }
  });
});

describe('production safety', () => {
  const production = {
    ...base,
    NODE_ENV: 'production',
    WEB_ORIGINS: 'https://example.jo',
    ADMIN_ORIGINS: 'https://admin.example.jo',
  };

  it('refuses the development console OTP channel in production', () => {
    expect(() => parseConfig(production)).toThrow(/OTP_CHANNEL=console/);
  });

  it('refuses insecure cookies and http origins in production', () => {
    expect(() => parseConfig({ ...production, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => parseConfig({ ...production, WEB_ORIGINS: 'http://example.jo' })).toThrow(/https/);
  });

  it('requires a long AUTH_SECRET', () => {
    expect(() => parseConfig({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/);
  });

  it('parses origin lists and cookie flags', () => {
    const c = parseConfig({
      ...base,
      WEB_ORIGINS: 'https://a.jo, https://b.jo',
      COOKIE_SECURE: 'true',
    });
    expect(c.webOrigins).toEqual(['https://a.jo', 'https://b.jo']);
    expect(c.cookieSecure).toBe(true);
    expect(() => parseConfig({ ...base, WEB_ORIGINS: 'https://a.jo/path' })).toThrow(/WEB_ORIGINS/);
  });
});

describe('loadDotEnv', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'js-env-'));
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    await writeFile(join(root, '.env'), 'DATABASE_URL=postgres://from-file/db\nLOG_LEVEL=debug\n');
    await mkdir(join(root, 'apps', 'api'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('loads the workspace-root .env from a nested directory', () => {
    const env: Record<string, string | undefined> = {};
    expect(loadDotEnv(env, join(root, 'apps', 'api'))).toBe(join(root, '.env'));
    expect(env.DATABASE_URL).toBe('postgres://from-file/db');
    expect(env.LOG_LEVEL).toBe('debug');
  });

  it('never overrides variables that are already set', () => {
    const env: Record<string, string | undefined> = { LOG_LEVEL: 'warn' };
    loadDotEnv(env, root);
    expect(env.LOG_LEVEL).toBe('warn');
  });

  it('loads nothing in production', () => {
    const env: Record<string, string | undefined> = { NODE_ENV: 'production' };
    expect(loadDotEnv(env, root)).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('loads nothing when there is no workspace root', () => {
    const env: Record<string, string | undefined> = {};
    expect(loadDotEnv(env, tmpdir())).toBeUndefined();
  });
});
