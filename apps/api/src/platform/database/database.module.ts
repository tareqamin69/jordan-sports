import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { createDatabase, createPool, type Db } from './database.js';
import { Migrator } from './migrator.js';

export const PG_POOL = Symbol('PG_POOL');
export const DATABASE = Symbol('DATABASE');
export const MIGRATOR = Symbol('MIGRATOR');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): pg.Pool => {
        const pool = createPool({
          connectionString: config.databaseUrl,
          max: config.databasePoolMax,
          appRole: config.databaseAppRole,
        });
        const logger = new Logger('Database');
        // Errors on idle clients (e.g. the server restarting) must not crash the process.
        pool.on('error', (error) => logger.error(error));
        return pool;
      },
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Db => createDatabase(pool),
    },
    {
      provide: MIGRATOR,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Migrator => new Migrator({ pool }),
    },
  ],
  exports: [PG_POOL, DATABASE, MIGRATOR],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async onApplicationShutdown(): Promise<void> {
    // Destroying Kysely ends the underlying pool.
    await this.db.destroy();
  }
}
