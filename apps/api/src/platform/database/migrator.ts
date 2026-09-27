import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

/**
 * SQL-first migration runner (ADR-0002).
 *
 * - Files live in `apps/api/migrations` and are named `NNNN_snake_case_name.sql`.
 * - Each pending file runs in its own transaction and is recorded in
 *   `public.schema_migrations` with a SHA-256 checksum of its contents.
 * - Runs are serialized across processes with a Postgres advisory lock.
 * - Applied migrations must never change: a modified or out-of-order file stops the run.
 * - Migrations recorded in the database but absent from this build ("unknown") are tolerated,
 *   so an older build can run against a newer schema during an expand/contract rollout.
 */

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../migrations/', import.meta.url),
);

/** Arbitrary constant identifying the migration advisory lock for this application. */
export const MIGRATION_LOCK_KEY = '7340571193201';

const FILE_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
}

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: Date;
}

export interface MigrationPlan {
  readonly pending: readonly MigrationFile[];
  /** Applied migrations whose file content changed since they were applied. */
  readonly modified: readonly string[];
  /** Pending files numbered below the latest applied version. */
  readonly outOfOrder: readonly string[];
  /** Applied migrations that are not part of this build. */
  readonly unknown: readonly string[];
}

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

/** Checksum of a migration file; line endings are normalized so checkouts on any OS agree. */
export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export async function readMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];
  const seen = new Map<number, string>();
  for (const entry of entries) {
    const match = FILE_PATTERN.exec(entry);
    if (!match) {
      throw new MigrationError(
        `Invalid migration file name "${entry}": expected NNNN_snake_case_name.sql`,
      );
    }
    const version = Number(match[1]);
    const clash = seen.get(version);
    if (clash) {
      throw new MigrationError(`Duplicate migration version ${version}: "${clash}" and "${entry}"`);
    }
    seen.set(version, entry);
    const sql = await readFile(join(dir, entry), 'utf8');
    files.push({ version, name: entry, checksum: migrationChecksum(sql), sql });
  }
  return files.sort((a, b) => a.version - b.version);
}

export function planMigrations(
  files: readonly MigrationFile[],
  applied: readonly Pick<AppliedMigration, 'version' | 'name' | 'checksum'>[],
): MigrationPlan {
  const appliedByVersion = new Map(applied.map((m) => [m.version, m]));
  const fileVersions = new Set(files.map((f) => f.version));
  const latestApplied = applied.reduce((max, m) => Math.max(max, m.version), 0);

  const pending: MigrationFile[] = [];
  const modified: string[] = [];
  const outOfOrder: string[] = [];
  for (const file of files) {
    const record = appliedByVersion.get(file.version);
    if (!record) {
      pending.push(file);
      if (file.version < latestApplied) outOfOrder.push(file.name);
    } else if (record.name !== file.name || record.checksum !== file.checksum) {
      modified.push(file.name);
    }
  }
  const unknown = applied.filter((m) => !fileVersions.has(m.version)).map((m) => m.name);
  return { pending, modified, outOfOrder, unknown };
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version     integer     PRIMARY KEY,
    name        text        NOT NULL UNIQUE,
    checksum    char(64)    NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )`;

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date;
}

async function readApplied(client: pg.Pool | pg.PoolClient): Promise<AppliedMigration[]> {
  const exists = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
  );
  if (!exists.rows[0]?.exists) return [];
  const { rows } = await client.query<AppliedRow>(
    'SELECT version, name, checksum, applied_at FROM public.schema_migrations ORDER BY version',
  );
  return rows.map((r) => ({
    version: r.version,
    name: r.name,
    checksum: r.checksum,
    appliedAt: r.applied_at,
  }));
}

export interface MigratorOptions {
  readonly pool: pg.Pool;
  readonly migrationsDir?: string;
  readonly log?: (message: string) => void;
}

export class Migrator {
  private readonly pool: pg.Pool;
  private readonly dir: string;
  private readonly log: (message: string) => void;

  constructor(options: MigratorOptions) {
    this.pool = options.pool;
    this.dir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
    this.log = options.log ?? (() => undefined);
  }

  /** Read-only comparison of the migration files with the database. Takes no lock. */
  async plan(): Promise<MigrationPlan> {
    const files = await readMigrationFiles(this.dir);
    return planMigrations(files, await readApplied(this.pool));
  }

  /** Applies all pending migrations. Returns the names of the migrations it applied. */
  async migrate(): Promise<string[]> {
    const files = await readMigrationFiles(this.dir);
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_KEY]);
      try {
        await client.query(CREATE_TABLE_SQL);
        const plan = planMigrations(files, await readApplied(client));

        if (plan.modified.length > 0) {
          throw new MigrationError(
            `Applied migrations were modified: ${plan.modified.join(', ')}. ` +
              'Never edit an applied migration; add a new one instead.',
          );
        }
        if (plan.outOfOrder.length > 0) {
          throw new MigrationError(
            `Migrations are numbered below the latest applied version: ${plan.outOfOrder.join(', ')}. ` +
              'Renumber them after the latest applied migration.',
          );
        }
        for (const name of plan.unknown) {
          this.log(`warning: database has migration ${name} which is not part of this build`);
        }

        const applied: string[] = [];
        for (const file of plan.pending) {
          this.log(`applying ${file.name}`);
          try {
            await client.query('BEGIN');
            await client.query(file.sql);
            await client.query(
              'INSERT INTO public.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
              [file.version, file.name, file.checksum],
            );
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw new MigrationError(`Migration ${file.name} failed: ${(error as Error).message}`, {
              cause: error,
            });
          }
          applied.push(file.name);
        }
        return applied;
      } finally {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY]);
      }
    } finally {
      client.release();
    }
  }
}
