import { Module } from '@nestjs/common';
import { BookingsService } from './application/bookings.service.js';
import { LifecycleService } from './application/lifecycle.service.js';
import { VenueBookingsService } from './application/venue-bookings.service.js';
import { VenuePaymentsService } from './application/venue-payments.service.js';
import { AdminBookingsController } from './http/admin-bookings.controller.js';
import { BookingsController } from './http/bookings.controller.js';
import { ManageBookingsController } from './http/manage-bookings.controller.js';

@Module({
  providers: [BookingsService, VenueBookingsService, VenuePaymentsService, LifecycleService],
  controllers: [BookingsController, ManageBookingsController, AdminBookingsController],
  exports: [BookingsService, VenueBookingsService, VenuePaymentsService, LifecycleService],
})
export class BookingsModule {}

/** Background-only providers (worker process): no HTTP controllers. */
@Module({ providers: [LifecycleService], exports: [LifecycleService] })
export class BookingsLifecycleModule {}
