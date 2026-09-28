import { Controller, Get, Query } from '@nestjs/common';
import { adminListBookings } from '@jordan-sports/contracts';
import { AdminAuth } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { VenueBookingsService } from '../application/venue-bookings.service.js';

@Controller()
@AdminAuth()
export class AdminBookingsController {
  constructor(private readonly bookings: VenueBookingsService) {}

  @Get(adminListBookings.path)
  list(@Query() query: unknown) {
    return this.bookings.adminList(parseInput(adminListBookings.query, query));
  }
}
