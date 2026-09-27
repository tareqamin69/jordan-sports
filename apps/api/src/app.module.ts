import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './platform/config/config.js';
import { ConfigModule } from './platform/config/config.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthModule } from './platform/health/health.module.js';

/**
 * Root module. Domain modules (identity, tenancy, catalog, …) are added under
 * src/modules/ from M1 onwards; platform concerns live under src/platform/.
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule, HealthModule],
    };
  }
}
