import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

/**
 * Database schema types. Generated from the migrated schema (kysely-codegen) once the first
 * tables exist (M1); empty until then.
 */
export type Database = Record<string, never>;

export interface PoolOptions {
  readonly connectionString: string;
  readonly max: number;
}

export function createPool(options: PoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: options.connectionString,
    max: options.max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: 'jordan-sports-api',
  });
}

export function createDatabase(pool: pg.Pool): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
