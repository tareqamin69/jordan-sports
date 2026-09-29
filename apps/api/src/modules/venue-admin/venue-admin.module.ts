import { Module } from '@nestjs/common';
import { VenueOversightService } from './application/venue-oversight.service.js';
import { AdminVenuesController } from './http/admin-venues.controller.js';
import {
  AdminVenueOversightController,
  ManageVenueOversightController,
} from './http/venue-oversight.controller.js';

@Module({
  providers: [VenueOversightService],
  controllers: [
    AdminVenuesController,
    AdminVenueOversightController,
    ManageVenueOversightController,
  ],
})
export class VenueAdminModule {}
