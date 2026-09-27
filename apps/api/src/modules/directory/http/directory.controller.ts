import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  getVenue,
  listVenues,
  type EndpointOutput,
  type PublicVenue,
} from '@jordan-sports/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { MediaService } from '../../venues/index.js';
import { DirectoryService } from '../application/directory.service.js';

@Controller()
@Public()
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly media: MediaService,
  ) {}

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
