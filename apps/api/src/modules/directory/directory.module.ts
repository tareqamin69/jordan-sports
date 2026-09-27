import { Global, Module } from '@nestjs/common';
import { AvailabilityViewService } from './application/availability-view.service.js';
import { DirectoryService } from './application/directory.service.js';
import { VenueViewsService } from './application/views.service.js';
import { DirectoryController } from './http/directory.controller.js';

@Global()
@Module({
  providers: [DirectoryService, VenueViewsService, AvailabilityViewService],
  controllers: [DirectoryController],
  exports: [VenueViewsService],
})
export class DirectoryModule {}
