import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  adminArchiveVenue,
  adminGetVenueRating,
  adminGetVenueStats,
  adminRateVenue,
  archiveOwnVenue,
  getVenueStats,
  hasPlatformPermission,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { VenueOversightService } from '../application/venue-oversight.service.js';

@Controller()
@AdminAuth()
export class AdminVenueOversightController {
  constructor(private readonly oversight: VenueOversightService) {}

  @Post(adminArchiveVenue.path)
  @HttpCode(200)
  async archive(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(adminArchiveVenue.params, params);
    const input = parseInput(adminArchiveVenue.body, body);
    await this.oversight.archive(
      { type: 'admin', userId: actor.userId, meta: requestMeta(request) },
      venueId,
      input,
    );
    return { ok: true as const };
  }

  @Get(adminGetVenueRating.path)
  ratings(@Param() params: unknown) {
    const { venueId } = parseInput(adminGetVenueRating.params, params);
    return this.oversight.ratings(venueId);
  }

  @Post(adminRateVenue.path)
  rate(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(adminRateVenue.params, params);
    const input = parseInput(adminRateVenue.body, body);
    return this.oversight.rate(
      { type: 'admin', userId: actor.userId, meta: requestMeta(request) },
      venueId,
      input,
    );
  }

  @Get(adminGetVenueStats.path)
  stats(@Param() params: unknown, @Query() query: unknown, @CurrentActor() actor: Actor) {
    const { venueId } = parseInput(adminGetVenueStats.params, params);
    const { days } = parseInput(adminGetVenueStats.query, query);
    const revenue =
      actor.kind === 'admin' && hasPlatformPermission(actor.platformRole, 'revenue.read');
    return this.oversight.stats(venueId, days, revenue);
  }
}

/** Venue owners archive their own venue (the guard checks `venue.archive` in its organization). */
@Controller()
@UserAuth()
export class ManageVenueOversightController {
  constructor(private readonly oversight: VenueOversightService) {}

  @Get(getVenueStats.path)
  stats(@Param() params: unknown, @Query() query: unknown) {
    const { venueId } = parseInput(getVenueStats.params, params);
    const { days } = parseInput(getVenueStats.query, query);
    // The guard checked `reports.read` (venue owners) in the venue's organization.
    return this.oversight.stats(venueId, days, true);
  }

  @Post(archiveOwnVenue.path)
  @HttpCode(200)
  async archive(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(archiveOwnVenue.params, params);
    const input = parseInput(archiveOwnVenue.body, body);
    await this.oversight.archive(
      { type: 'user', userId: actor.userId, meta: requestMeta(request) },
      venueId,
      input,
    );
    return { ok: true as const };
  }
}
