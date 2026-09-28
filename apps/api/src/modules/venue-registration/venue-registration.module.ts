import { Module } from '@nestjs/common';
import { ManageVenuesController } from './http/manage-venues.controller.js';

@Module({ controllers: [ManageVenuesController] })
export class VenueRegistrationModule {}
