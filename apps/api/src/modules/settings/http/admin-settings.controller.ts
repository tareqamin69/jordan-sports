import { Body, Controller, Get, Param, Patch, Put, Req } from '@nestjs/common';
import {
  adminGetSettings,
  adminSetVenueCommission,
  adminUpdateSettings,
  type PlatformSettings,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { SettingsService } from '../application/settings.service.js';

@Controller()
@AdminAuth()
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get(adminGetSettings.path)
  get(@Req() request: FastifyRequest): Promise<PlatformSettings> {
    return this.settings.view(request.ip || null);
  }

  @Patch(adminUpdateSettings.path)
  update(
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<PlatformSettings> {
    const patch = parseInput(adminUpdateSettings.body, body);
    return this.settings.update({ userId: actor.userId, meta: requestMeta(request) }, patch);
  }

  @Put(adminSetVenueCommission.path)
  setCommission(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(adminSetVenueCommission.params, params);
    const { commissionBps, reason } = parseInput(adminSetVenueCommission.body, body);
    return this.settings.setVenueCommission(
      { userId: actor.userId, meta: requestMeta(request) },
      venueId,
      commissionBps,
      reason,
    );
  }
}
