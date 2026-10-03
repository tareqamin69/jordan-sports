import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../platform/config/config.js';
import { APP_CONFIG } from '../../platform/config/config.module.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { CatalogModule } from '../catalog/index.js';
import { PlacesClient } from './application/places-client.js';
import { LINK_FETCHER, VenueImportService } from './application/venue-import.service.js';
import { VenueImportController } from './http/venue-import.controller.js';

@Module({
  imports: [CatalogModule],
  controllers: [VenueImportController],
  providers: [
    VenueImportService,
    // The real HTTPS resolver by default; tests provide a fake one.
    { provide: LINK_FETCHER, useValue: undefined },
    {
      provide: PlacesClient,
      inject: [APP_CONFIG, REDIS],
      useFactory: (config: AppConfig, redis: Redis) =>
        new PlacesClient(config.googlePlaces.apiKey, config.googlePlaces.dailyCap, redis),
    },
  ],
})
export class VenueImportModule {}
