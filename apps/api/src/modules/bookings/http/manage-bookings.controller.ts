import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  cancelVenueBooking,
  createManualBooking,
  listVenueBookings,
  type VenueBooking,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { VenueBookingsService } from '../application/venue-bookings.service.js';

@Controller()
@UserAuth()
export class ManageBookingsController {
  constructor(private readonly bookings: VenueBookingsService) {}

  @Get(listVenueBookings.path)
  list(@Param() params: unknown, @Query() query: unknown, @CurrentActor() actor: Actor) {
    const { venueId } = parseInput(listVenueBookings.params, params);
    const { from, to } = parseInput(listVenueBookings.query, query);
    return this.bookings.list(actor.userId, venueId, from, to);
  }

  @Post(createManualBooking.path)
  create(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(createManualBooking.params, params);
    const input = parseInput(createManualBooking.body, body);
    return this.bookings.createManual(
      { userId: actor.userId, meta: requestMeta(request) },
      venueId,
      input,
    );
  }

  @Post(cancelVenueBooking.path)
  @HttpCode(200)
  cancel(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenueBooking> {
    const { bookingId } = parseInput(cancelVenueBooking.params, params);
    const { reason } = parseInput(cancelVenueBooking.body, body);
    return this.bookings.cancel(
      { userId: actor.userId, meta: requestMeta(request) },
      bookingId,
      reason,
    );
  }
}
