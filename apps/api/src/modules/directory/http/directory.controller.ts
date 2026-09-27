import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  getVenue,
  getVenueAvailability,
  listVenues,
  type EndpointOutput,
  type PricedAvailability,
  type PublicVenue,
} from '@jordan-sports/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { MediaService } from '../../venues/index.js';
import { AvailabilityViewService } from '../application/availability-view.service.js';
import { DirectoryService } from '../application/directory.service.js';

@Controller()
@Public()
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly media: MediaService,
    private readonly availability: AvailabilityViewService,
  ) {}

  @Get(getVenueAvailability.path)
  availabilityForVenue(
    @Param() params: unknown,
    @Query() query: unknown,
  ): Promise<PricedAvailability> {
    const { slug } = parseInput(getVenueAvailability.params, params);
    const { date } = parseInput(getVenueAvailability.query, query);
    return this.availability.forVenue(slug, date);
  }

  @Get(listVenues.path)
  list(@Query() query: unknown): Promise<EndpointOutput<typeof listVenues>> {
    const q = parseInput(listVenues.query, query);
    return this.directory.list({
      limit: q.limit,
      ...(q.cursor ? { cursor: q.cursor } : {}),
      ...(q.sport ? { sport: q.sport } : {}),
      ...(q.city ? { city: q.city } : {}),
      ...(q.area ? { area: q.area } : {}),
    });
  }

  @Get(getVenue.path)
  get(@Param() params: unknown): Promise<PublicVenue> {
    const { slug } = parseInput(getVenue.params, params);
    return this.directory.get(slug);
  }

  /** Public photos of approved venues. Immutable: a changed photo gets a new id. */
  @Get('/v1/media/:mediaId')
  async photo(@Param() params: unknown, @Res() reply: FastifyReply): Promise<void> {
    const { mediaId } = parseInput(z.object({ mediaId: z.string().uuid() }), params);
    const data = await this.media.read(mediaId);
    await reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(data);
  }
}
