import { type DynamicModule, Module } from '@nestjs/common';
import { BookingsLifecycleModule } from './modules/bookings/index.js';
import { AuditModule } from './modules/audit/index.js';
import { NotificationsModule } from './modules/notifications/index.js';
import { PaymentsModule } from './modules/payments/index.js';
import type { AppConfig } from './platform/config/config.js';
import { ConfigModule } from './platform/config/config.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { RedisModule } from './platform/redis/redis.module.js';
import { JobsService } from './worker/jobs.service.js';

/**
 * Background worker (no HTTP API): scheduled booking transitions, card checkouts nobody came
 * back from, refund retries and the outbox dispatcher.
 */
@Module({})
export class WorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        RedisModule,
        AuditModule,
        PaymentsModule,
        NotificationsModule,
        BookingsLifecycleModule,
      ],
      providers: [JobsService],
    };
  }
}
