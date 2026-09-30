import { Module } from '@nestjs/common';
import { BookingsService } from './application/bookings.service.js';
import { CheckoutService } from './application/checkout.service.js';
import { LifecycleService } from './application/lifecycle.service.js';
import { VenueBookingsService } from './application/venue-bookings.service.js';
import { AdminBookingsController } from './http/admin-bookings.controller.js';
import { BookingsController } from './http/bookings.controller.js';
import { ManageBookingsController } from './http/manage-bookings.controller.js';

@Module({
  providers: [BookingsService, VenueBookingsService, CheckoutService, LifecycleService],
  controllers: [BookingsController, ManageBookingsController, AdminBookingsController],
  exports: [BookingsService, VenueBookingsService, CheckoutService, LifecycleService],
})
export class BookingsModule {}

/** Background-only providers (worker process): no HTTP controllers. */
@Module({
  providers: [LifecycleService, CheckoutService],
  exports: [LifecycleService, CheckoutService],
})
export class BookingsLifecycleModule {}
