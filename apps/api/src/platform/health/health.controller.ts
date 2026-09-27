import type { LivenessResponse, ReadinessResponse } from '@jordan-sports/contracts';
import { Controller, Get, Inject, Logger, Res } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators.js';
import { REDIS } from '../redis/redis.module.js';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../database/database.js';
import { DATABASE, MIGRATOR } from '../database/database.module.js';
import type { Migrator } from '../database/migrator.js';

/**
 * Operational endpoints (unversioned, see docs/architecture.md §N and §T).
 * Responses never include error details, versions or hostnames; failures are logged instead.
 */
@Controller()
@Public()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(MIGRATOR) private readonly migrator: Migrator,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is serving HTTP. Checks no dependencies. */
  @Get('healthz')
  liveness(): LivenessResponse {
    return { status: 'ok' };
  }

  /** Readiness: database reachable, all migrations of this build applied, Redis reachable. */
  @Get('readyz')
  async readiness(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessResponse> {
    let database: 'ok' | 'failed' = 'ok';
    let migrations: 'ok' | 'failed' = 'failed';
    let redis: 'ok' | 'failed' = 'ok';

    try {
      await sql`SELECT 1`.execute(this.db);
    } catch (error) {
      database = 'failed';
      this.logger.error(error);
    }

    if (database === 'ok') {
      try {
        const plan = await this.migrator.plan();
        const upToDate =
          plan.pending.length === 0 && plan.modified.length === 0 && plan.outOfOrder.length === 0;
        migrations = upToDate ? 'ok' : 'failed';
        if (!upToDate) {
          this.logger.warn(
            `not ready: ${plan.pending.length} pending, ${plan.modified.length} modified, ` +
              `${plan.outOfOrder.length} out-of-order migration(s)`,
          );
        }
      } catch (error) {
        this.logger.error(error);
      }
    }

    try {
      if ((await this.redis.ping()) !== 'PONG') redis = 'failed';
    } catch (error) {
      redis = 'failed';
      this.logger.error(error);
    }

    const ready = database === 'ok' && migrations === 'ok' && redis === 'ok';
    reply.status(ready ? 200 : 503);
    return { status: ready ? 'ready' : 'not_ready', checks: { database, migrations, redis } };
  }
}
