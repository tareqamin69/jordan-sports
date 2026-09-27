import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from './schema.js';

/** Database schema types, generated from the migrated schema (`pnpm db:codegen`). */
export type Database = DB;
export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;
export type DbOrTx = Db | Tx;

export interface PoolOptions {
  readonly connectionString: string;
  readonly max: number;
  /** Non-login role to switch to on every new connection (see migration 0002). */
  readonly appRole?: string;
}

// timestamptz and date columns: keep `date` as the plain YYYY-MM-DD string (no time zone shift).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export function createPool(options: PoolOptions): pg.Pool {
  if (options.appRole && !/^[a-z_][a-z0-9_]*$/.test(options.appRole)) {
    throw new Error('Invalid database role name');
  }
  return new pg.Pool({
    connectionString: options.connectionString,
    max: options.max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: 'jordan-sports-api',
    // Startup parameter: the session runs as the restricted role from its first statement, and
    // the connection fails outright if the role cannot be assumed (never silently privileged).
    ...(options.appRole ? { options: `-c role=${options.appRole}` } : {}),
  });
}

export function createDatabase(pool: pg.Pool): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
