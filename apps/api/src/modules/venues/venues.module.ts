import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../../platform/config/config.js';
import { FilesystemMediaStorage, MEDIA_STORAGE } from '../../platform/storage/media-storage.js';
import { MediaService } from './application/media.service.js';
import { VenueAccessService } from './application/venue-access.service.js';
import { VenuesService } from './application/venues.service.js';

@Module({})
export class VenuesModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: VenuesModule,
      global: true,
      providers: [
        VenuesService,
        VenueAccessService,
        MediaService,
        { provide: MEDIA_STORAGE, useValue: new FilesystemMediaStorage(config.mediaDir) },
      ],
      exports: [VenuesService, VenueAccessService, MediaService],
    };
  }
}
