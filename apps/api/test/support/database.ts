import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { loadDotEnv } from '../../src/platform/config/config.js';

export function baseDatabaseUrl(): string {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Integration tests need DATABASE_URL (see .env.example). Start local infrastructure with `pnpm infra:up`.',
    );
  }
  return url;
}

export interface TestDatabase {
  readonly url: string;
  drop(): Promise<void>;
}

/** Creates an empty, uniquely named database on the configured server. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const base = baseDatabaseUrl();
  const name = `js_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(base);
  url.pathname = `/${name}`;

  return {
    url: url.toString(),
    async drop() {
      const client = new pg.Client({ connectionString: base });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}

/** A temporary migrations directory for runner tests. */
export async function createMigrationsDir(files: Record<string, string>): Promise<{
  readonly dir: string;
  write(name: string, sql: string): Promise<void>;
  remove(): Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'js-migrations-'));
  const write = (name: string, sql: string) => writeFile(join(dir, name), sql, 'utf8');
  for (const [name, sql] of Object.entries(files)) await write(name, sql);
  return { dir, write, remove: () => rm(dir, { recursive: true, force: true }) };
}
