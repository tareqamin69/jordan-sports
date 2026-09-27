import { Module } from '@nestjs/common';
import { AdminVenuesController } from './http/admin-venues.controller.js';

@Module({ controllers: [AdminVenuesController] })
export class VenueAdminModule {}
