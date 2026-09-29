import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { adminCancelBooking, adminGetBooking, adminListBookings } from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
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

  @Get(adminGetBooking.path)
  get(@Param() params: unknown) {
    return this.bookings.adminGet(parseInput(adminGetBooking.params, params).bookingId);
  }

  @Post(adminCancelBooking.path)
  @HttpCode(200)
  cancel(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { bookingId } = parseInput(adminCancelBooking.params, params);
    const { reason } = parseInput(adminCancelBooking.body, body);
    return this.bookings.adminCancel(
      { userId: actor.userId, meta: requestMeta(request) },
      bookingId,
      reason,
    );
  }
}
