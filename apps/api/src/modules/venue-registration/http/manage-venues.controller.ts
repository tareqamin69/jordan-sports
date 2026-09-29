import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import {
  createMyFacility,
  createMyResource,
  deleteMyVenueMedia,
  getMyVenueProfile,
  registerVenue,
  reorderMyVenueMedia,
  submitMyVenue,
  updateMyResource,
  updateMyVenue,
  uploadMyVenueMedia,
  type AdminVenue,
} from '@jordan-sports/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Actor as SessionActor } from '../../../platform/auth/actor.js';
import { CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { Errors } from '../../../platform/http/errors.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { slugify } from '../../../platform/text/slugify.js';
import { VenueViewsService } from '../../directory/index.js';
import { ResourcesService } from '../../resources/index.js';
import { SettingsService } from '../../settings/index.js';
import { OrganizationsService } from '../../tenancy/index.js';
import { MediaService, VenueAccessService, VenuesService, type Actor } from '../../venues/index.js';

function userActor(actor: SessionActor, request: FastifyRequest): Actor {
  if (!actor.userId) throw Errors.unauthenticated();
  return { type: 'user', userId: actor.userId, meta: requestMeta(request) };
}

function requireUserId(actor: SessionActor): string {
  if (!actor.userId) throw Errors.unauthenticated();
  return actor.userId;
}

/**
 * Venue self-registration and self-management (plan §3): any signed-in user can register a
 * venue (becoming its owner); further changes are authorized per venue via VenueAccessService
 * (ADR-0008), never admin-gated. Reuses the same service layer as the admin console — the
 * business rules (draft → submitted → approved, slug uniqueness, resource validation…) are
 * identical; only who may call them and how they authenticate differs.
 */
@Controller()
@UserAuth()
export class ManageVenuesController {
  constructor(
    private readonly venues: VenuesService,
    private readonly resources: ResourcesService,
    private readonly media: MediaService,
    private readonly views: VenueViewsService,
    private readonly access: VenueAccessService,
    private readonly organizations: OrganizationsService,
    private readonly settings: SettingsService,
  ) {}

  /** Name or photo changes on a published venue go back to review only if the platform says so. */
  private async reviewIfRequired(venueId: string, actor: Actor): Promise<void> {
    if (await this.settings.venueEditsNeedReview()) {
      await this.venues.returnToReview(venueId, 'Changed by the venue owner', actor);
    }
  }

  @Post(registerVenue.path)
  async register(
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const input = parseInput(registerVenue.body, body);
    const userId = requireUserId(actor);
    const meta = requestMeta(request);
    const org = await this.organizations.createForUser(userId, { name: input.name }, meta);
    const venueId = await this.venues.create(
      org.id,
      {
        slug: slugify(input.name.en ?? input.name.ar ?? ''),
        name: input.name,
        description: input.description,
        governorateId: input.governorateId,
        areaId: input.areaId,
        address: input.address,
        location: input.location,
        contactPhone: input.contactPhone,
        amenityIds: [],
      },
      userActor(actor, request),
    );
    return this.views.adminVenue(venueId);
  }

  @Get(getMyVenueProfile.path)
  async profile(
    @Param() params: unknown,
    @CurrentActor() actor: SessionActor,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(getMyVenueProfile.params, params);
    await this.access.require(requireUserId(actor), venueId, 'venue.read');
    return this.views.adminVenue(venueId);
  }

  @Patch(updateMyVenue.path)
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(updateMyVenue.params, params);
    const input = parseInput(updateMyVenue.body, body);
    await this.access.require(requireUserId(actor), venueId, 'venue.edit');
    await this.venues.update(venueId, input, userActor(actor, request));
    if (input.name !== undefined) await this.reviewIfRequired(venueId, userActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  @Post(submitMyVenue.path)
  async submit(
    @Param() params: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(submitMyVenue.params, params);
    await this.access.require(requireUserId(actor), venueId, 'venue.edit');
    await this.venues.setStatus(venueId, 'submitted', '', userActor(actor, request), (id) =>
      this.resources.hasActiveResource(id),
    );
    return this.views.adminVenue(venueId);
  }

  @Post(createMyFacility.path)
  async createFacility(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(createMyFacility.params, params);
    const input = parseInput(createMyFacility.body, body);
    await this.access.require(requireUserId(actor), venueId, 'venue.edit');
    await this.venues.addFacility(venueId, input.name, userActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  @Post(createMyResource.path)
  async createResource(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(createMyResource.params, params);
    const input = parseInput(createMyResource.body, body);
    const { venue } = await this.access.require(requireUserId(actor), venueId, 'venue.edit');
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
      userActor(actor, request),
    );
    return this.views.adminVenue(venueId);
  }

  @Patch(updateMyResource.path)
  async updateResource(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { resourceId } = parseInput(updateMyResource.params, params);
    const input = parseInput(updateMyResource.body, body);
    const resource = await this.resources.find(resourceId);
    const { venue } = await this.access.require(
      requireUserId(actor),
      resource.venueId,
      'venue.edit',
    );
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.resources.update(resourceId, venue.organizationId, patch, userActor(actor, request));
    return this.views.adminVenue(venue.id);
  }

  @Post(uploadMyVenueMedia.path)
  async upload(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(uploadMyVenueMedia.params, params);
    const { venue } = await this.access.require(requireUserId(actor), venueId, 'venue.edit');
    const contentType = String(request.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim();
    await this.media.upload(
      venueId,
      venue.organizationId,
      Buffer.isBuffer(body) ? body : Buffer.alloc(0),
      contentType,
      userActor(actor, request),
    );
    await this.reviewIfRequired(venueId, userActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  @Put(reorderMyVenueMedia.path)
  async reorderPhotos(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { venueId } = parseInput(reorderMyVenueMedia.params, params);
    const { mediaIds } = parseInput(reorderMyVenueMedia.body, body);
    await this.access.require(requireUserId(actor), venueId, 'venue.edit');
    await this.media.reorder(venueId, mediaIds, userActor(actor, request));
    await this.reviewIfRequired(venueId, userActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  @Delete(deleteMyVenueMedia.path)
  async deleteMedia(
    @Param() params: unknown,
    @CurrentActor() actor: SessionActor,
    @Req() request: FastifyRequest,
  ): Promise<AdminVenue> {
    const { mediaId } = parseInput(deleteMyVenueMedia.params, params);
    const userId = requireUserId(actor);
    const owningVenueId = await this.media.venueIdOf(mediaId);
    await this.access.require(userId, owningVenueId, 'venue.edit');
    const venueId = await this.media.delete(mediaId, userActor(actor, request));
    await this.reviewIfRequired(venueId, userActor(actor, request));
    return this.views.adminVenue(venueId);
  }

  /** Owner preview of an uploaded photo before the venue is approved (never publicly served until then). */
  @Get('/v1/manage/media/:mediaId')
  async photo(
    @Param() params: unknown,
    @CurrentActor() actor: SessionActor,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { mediaId } = parseInput(z.object({ mediaId: z.string().uuid() }), params);
    const owningVenueId = await this.media.venueIdOf(mediaId);
    await this.access.require(requireUserId(actor), owningVenueId, 'venue.read');
    const data = await this.media.readAny(mediaId);
    await reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'private, max-age=3600')
      .send(data);
  }
}
