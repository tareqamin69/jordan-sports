import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AccountModule } from './modules/account/account.module.js';
import { AuditModule } from './modules/audit/index.js';
import { BookingsModule } from './modules/bookings/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { DirectoryModule } from './modules/directory/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { NotificationsModule } from './modules/notifications/index.js';
import { PricingModule } from './modules/pricing/index.js';
import { ResourcesModule } from './modules/resources/index.js';
import { SchedulingModule } from './modules/scheduling/index.js';
import { TenancyModule } from './modules/tenancy/index.js';
import { VenueAdminModule } from './modules/venue-admin/venue-admin.module.js';
import { VenuesModule } from './modules/venues/index.js';
import { AuthGuard } from './platform/auth/auth.guard.js';
import type { AppConfig } from './platform/config/config.js';
import { ConfigModule } from './platform/config/config.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { IdempotencyModule } from './platform/idempotency/idempotency.module.js';
import { OriginGuard } from './platform/http/origin.guard.js';
import { ProblemDetailsFilter } from './platform/http/problem-details.filter.js';
import { OpenApiController } from './platform/openapi/openapi.controller.js';
import { RedisModule } from './platform/redis/redis.module.js';

/**
 * Root module. Domain modules live under src/modules/ and talk to each other only through their
 * public index.ts; platform concerns live under src/platform/.
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        RedisModule,
        HealthModule,
        AuditModule,
        IdentityModule.forRoot(config),
        TenancyModule,
        AccountModule,
        CatalogModule,
        VenuesModule.forRoot(config),
        ResourcesModule,
        DirectoryModule,
        SchedulingModule,
        PricingModule,
        VenueAdminModule,
        IdempotencyModule,
        NotificationsModule,
        BookingsModule,
      ],
      controllers: [OpenApiController],
      providers: [
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        // Order matters: reject foreign origins before touching sessions.
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
