import { type DynamicModule, Module } from '@nestjs/common';
import { BookingsLifecycleModule } from './modules/bookings/index.js';
import { NotificationsModule } from './modules/notifications/index.js';
import type { AppConfig } from './platform/config/config.js';
import { ConfigModule } from './platform/config/config.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { JobsService } from './worker/jobs.service.js';

/** Background worker (no HTTP API): scheduled booking transitions and the outbox dispatcher. */
@Module({})
export class WorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        NotificationsModule,
        BookingsLifecycleModule,
      ],
      providers: [JobsService],
    };
  }
}
