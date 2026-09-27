import { Global, Module } from '@nestjs/common';
import { DirectoryService } from './application/directory.service.js';
import { VenueViewsService } from './application/views.service.js';
import { DirectoryController } from './http/directory.controller.js';

@Global()
@Module({
  providers: [DirectoryService, VenueViewsService],
  controllers: [DirectoryController],
  exports: [VenueViewsService],
})
export class DirectoryModule {}
