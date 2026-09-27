import { Body, Controller, Delete, Get, Param, Post, Patch, Req, Res } from '@nestjs/common';
import {
  adminCreateFacility,
  adminCreateResource,
  adminCreateVenue,
  adminDeleteVenueMedia,
  adminGetVenue,
  adminListVenues,
  adminSetVenueStatus,
  adminUpdateResource,
  adminUpdateVenue,
  adminUploadVenueMedia,
  type AdminVenue,
  type EndpointOutput,
} from '@jordan-sports/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Actor as SessionActor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { VenueViewsService } from '../../directory/index.js';
import { ResourcesService } from '../../resources/index.js';
import { MediaService, VenuesService, type Actor } from '../../venues/index.js';

function adminActor(actor: SessionActor, request: FastifyRequest): Actor {
  return { type: 'admin', userId: actor.userId, meta: requestMeta(request) };
}

/** Pilot onboarding: platform admins create and configure venues (approved product decision). */
@Controller()
export class AdminVenuesController {
  constructor(
    private readonly venues: VenuesService,
    private readonly resources: ResourcesService,
    private readonly media: MediaService,
    private readonly views: VenueViewsService,
  ) {}

  @Get(adminListVenues.path)
  @AdminAuth('venues.read')
  async list(@Param() params: unknown): Promise<EndpointOutput<typeof adminListVenues>> {
    const { organizationId } = parseInput(adminListVenues.params, params);
    const venues = await this.venues.listByOrganization(organizationId);
    return {
      items: await Promise.all(
        venues.map(async (v) => ({
          id: v.id,
          slug: v.slug,
          name: v.name,
          status: v.status,
          resourceCount: (await this.resources.listForVenue(v.id)).length,
        })),
      ),
    };
  }

  @Post(adminCreateVenue.path)
  @AdminAuth('venues.manage')
  async create(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { organizationId } = parseInput(adminCreateVenue.params, params);
    const input = parseInput(adminCreateVenue.body, body);
    const id = await this.venues.create(organizationId, input, adminActor(actor, request));
    return this.views.adminVenue(id);
  }

  @Get(adminGetVenue.path)
  @AdminAuth('venues.read')
  get(@Param() params: unknown): Promise<AdminVenue> {
    const { venueId } = parseInput(adminGetVenue.params, params);
    return this.views.adminVenue(venueId);
  }

  @Patch(adminUpdateVenue.path)
  @AdminAuth('venues.manage')
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(adminUpdateVenue.params, params);
    const input = parseInput(adminUpdateVenue.body, body);
    await this.venues.update(venueId, input, adminActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  @Post(adminSetVenueStatus.path)
  @AdminAuth('venues.manage')
  async setStatus(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(adminSetVenueStatus.params, params);
    const input = parseInput(adminSetVenueStatus.body, body);
    await this.venues.setStatus(
      venueId,
      input.status,
      input.reason,
      adminActor(actor, request),
      (id) => this.resources.hasActiveResource(id),
    );
    return this.views.adminVenue(venueId);
  }

  @Post(adminCreateFacility.path)
  @AdminAuth('venues.manage')
  async createFacility(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(adminCreateFacility.params, params);
    const input = parseInput(adminCreateFacility.body, body);
    await this.venues.addFacility(venueId, input.name, adminActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  @Post(adminCreateResource.path)
  @AdminAuth('venues.manage')
  async createResource(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(adminCreateResource.params, params);
    const input = parseInput(adminCreateResource.body, body);
    const venue = await this.venues.find(venueId);
    await this.resources.create(
      venueId,
      venue.organizationId,
      {
        name: input.name,
        resourceTypeId: input.resourceTypeId,
        facilityId: input.facilityId ?? null,
        sportFormatIds: input.sportFormatIds,
        attributes: input.attributes,
        ...(input.combinesResourceIds ? { combinesResourceIds: input.combinesResourceIds } : {}),
      },
      adminActor(actor, request),
    );
    return this.views.adminVenue(venueId);
  }

  @Patch(adminUpdateResource.path)
  @AdminAuth('venues.manage')
  async updateResource(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { resourceId } = parseInput(adminUpdateResource.params, params);
    const input = parseInput(adminUpdateResource.body, body);
    const resource = await this.resources.find(resourceId);
    const venue = await this.venues.find(resource.venueId);
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.resources.update(
      resourceId,
      venue.organizationId,
      patch,
      adminActor(actor, request),
    );
    return this.views.adminVenue(venue.id);
  }

  @Post(adminUploadVenueMedia.path)
  @AdminAuth('venues.manage')
  async upload(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(adminUploadVenueMedia.params, params);
    const venue = await this.venues.find(venueId);
    const contentType = String(request.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim();
    await this.media.upload(
      venueId,
      venue.organizationId,
      Buffer.isBuffer(body) ? body : Buffer.alloc(0),
      contentType,
      adminActor(actor, request),
    );
    return this.views.adminVenue(venueId);
  }

  @Delete(adminDeleteVenueMedia.path)
  @AdminAuth('venues.manage')
  async deleteMedia(
    @Param() params: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { mediaId } = parseInput(adminDeleteVenueMedia.params, params);
    const venueId = await this.media.delete(mediaId, adminActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  /** Admin preview of any venue photo (e.g. before approval). */
  @Get('/v1/admin/media/:mediaId')
  @AdminAuth('venues.read')
  async photo(@Param() params: unknown, @Res() reply: FastifyReply): Promise<void> {
    const { mediaId } = parseInput(z.object({ mediaId: z.string().uuid() }), params);
    const data = await this.media.readAny(mediaId);
    await reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'private, max-age=3600')
      .send(data);
  }
}
