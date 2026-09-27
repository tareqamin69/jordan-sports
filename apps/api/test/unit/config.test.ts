import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, loadDotEnv, parseConfig } from '../../src/platform/config/config.js';

const DATABASE_URL = 'postgres://app:s3cret-value@localhost:5432/jordan_sports';

describe('parseConfig', () => {
  it('applies defaults for optional variables', () => {
    expect(parseConfig({ DATABASE_URL })).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 4000,
      databaseUrl: DATABASE_URL,
      databasePoolMax: 10,
      logLevel: 'info',
    });
  });

  it('coerces numeric variables', () => {
    const config = parseConfig({ DATABASE_URL, API_PORT: '8080', DATABASE_POOL_MAX: '3' });
    expect(config.port).toBe(8080);
    expect(config.databasePoolMax).toBe(3);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseConfig({})).toThrow(ConfigError);
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid values', () => {
    expect(() => parseConfig({ DATABASE_URL, API_PORT: '70000' })).toThrow(/API_PORT/);
    expect(() => parseConfig({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => parseConfig({ DATABASE_URL, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('never includes variable values in error messages', () => {
    const secret = 'mysql://root:super-secret-password@db/app';
    try {
      parseConfig({ DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/DATABASE_URL/);
      expect((error as Error).message).not.toContain('super-secret-password');
    }
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
