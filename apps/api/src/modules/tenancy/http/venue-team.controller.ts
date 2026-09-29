import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import {
  addVenueTeamMember,
  changeVenueTeamRole,
  listVenueTeam,
  removeVenueTeamMember,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { Errors } from '../../../platform/http/errors.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { VenueTeamService } from '../application/venue-team.service.js';

/** The organization comes from the guard (`request.tenant`), resolved from the path. */
function tenantOf(request: FastifyRequest): string {
  if (!request.tenant) throw Errors.forbidden();
  return request.tenant.organizationId;
}

@Controller()
@UserAuth()
export class VenueTeamController {
  constructor(private readonly team: VenueTeamService) {}

  @Get(listVenueTeam.path)
  list(@Param() params: unknown, @CurrentActor() actor: Actor, @Req() request: FastifyRequest) {
    parseInput(listVenueTeam.params, params);
    return this.team.list(tenantOf(request), actor.userId);
  }

  @Post(addVenueTeamMember.path)
  add(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    parseInput(addVenueTeamMember.params, params);
    const input = parseInput(addVenueTeamMember.body, body);
    return this.team.add(
      { userId: actor.userId, meta: requestMeta(request) },
      tenantOf(request),
      input,
    );
  }

  @Put(changeVenueTeamRole.path)
  changeRole(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { memberId } = parseInput(changeVenueTeamRole.params, params);
    const { role, confirmOwner } = parseInput(changeVenueTeamRole.body, body);
    tenantOf(request);
    return this.team.changeRole(
      { userId: actor.userId, meta: requestMeta(request) },
      memberId,
      role,
      confirmOwner,
    );
  }

  @Delete(removeVenueTeamMember.path)
  async remove(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { memberId } = parseInput(removeVenueTeamMember.params, params);
    tenantOf(request);
    await this.team.remove({ userId: actor.userId, meta: requestMeta(request) }, memberId);
    return { ok: true as const };
  }
}
