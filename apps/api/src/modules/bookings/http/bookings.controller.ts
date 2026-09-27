import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  cancelBooking,
  confirmBooking,
  createBookingHold,
  getBooking,
  listMyBookings,
  type Booking,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import {
  IdempotencyService,
  unwrapStored,
} from '../../../platform/idempotency/idempotency.service.js';
import { BookingsService } from '../application/bookings.service.js';

function idempotencyKey(request: FastifyRequest): string | undefined {
  const key = request.headers['idempotency-key'];
  return typeof key === 'string' ? key : undefined;
}

/** Player bookings. Hold and confirm are idempotent: clients retry with the same key. */
@Controller()
@UserAuth()
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post(createBookingHold.path)
  async hold(
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<Booking> {
    const input = parseInput(createBookingHold.body, body);
    const response = await this.idempotency.run<Booking>(
      actor.userId,
      idempotencyKey(request),
      IdempotencyService.hash(['hold', input]),
      async () => ({
        status: 201,
        body: await this.bookings.hold(actor.userId, {
          resourceId: input.resourceId,
          start: new Date(input.start),
          durationMinutes: input.durationMinutes,
        }),
      }),
    );
    return unwrapStored(response);
  }

  @Get(listMyBookings.path)
  async mine(@Query() query: unknown, @CurrentActor() actor: Actor) {
    const { scope } = parseInput(listMyBookings.query, query);
    return { items: await this.bookings.listMine(actor.userId, scope) };
  }

  @Get(getBooking.path)
  get(@Param() params: unknown, @CurrentActor() actor: Actor): Promise<Booking> {
    return this.bookings.get(actor.userId, parseInput(getBooking.params, params).bookingId);
  }

  @Post(confirmBooking.path)
  @HttpCode(200)
  async confirm(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<Booking> {
    const { bookingId } = parseInput(confirmBooking.params, params);
    const input = parseInput(confirmBooking.body, body);
    const response = await this.idempotency.run<Booking>(
      actor.userId,
      idempotencyKey(request),
      IdempotencyService.hash(['confirm', bookingId, input]),
      async () => ({ status: 200, body: await this.bookings.confirm(actor.userId, bookingId) }),
    );
    return unwrapStored(response);
  }

  @Post(cancelBooking.path)
  @HttpCode(200)
  cancel(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ): Promise<Booking> {
    const { bookingId } = parseInput(cancelBooking.params, params);
    const { reason } = parseInput(cancelBooking.body, body ?? {});
    return this.bookings.cancel(actor.userId, bookingId, reason);
  }
}
