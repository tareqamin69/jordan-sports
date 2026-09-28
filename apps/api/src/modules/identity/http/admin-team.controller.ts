import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import {
  adminChangeStaffRole,
  adminGetTeam,
  adminInviteStaff,
  adminRemoveStaff,
  adminRevokeInvitation,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { TeamService } from '../application/team.service.js';

@Controller()
@AdminAuth()
export class AdminTeamController {
  constructor(private readonly team: TeamService) {}

  private caller(actor: Actor, request: FastifyRequest) {
    return { userId: actor.userId, meta: requestMeta(request) };
  }

  @Get(adminGetTeam.path)
  list() {
    return this.team.list();
  }

  @Post(adminInviteStaff.path)
  invite(@Body() body: unknown, @CurrentActor() actor: Actor, @Req() request: FastifyRequest) {
    const input = parseInput(adminInviteStaff.body, body);
    return this.team.invite(this.caller(actor, request), input);
  }

  @Delete(adminRevokeInvitation.path)
  async revoke(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { invitationId } = parseInput(adminRevokeInvitation.params, params);
    await this.team.revokeInvitation(this.caller(actor, request), invitationId);
    return { ok: true as const };
  }

  @Put(adminChangeStaffRole.path)
  changeRole(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { userId } = parseInput(adminChangeStaffRole.params, params);
    const { role } = parseInput(adminChangeStaffRole.body, body);
    return this.team.changeRole(this.caller(actor, request), userId, role);
  }

  @Delete(adminRemoveStaff.path)
  async remove(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { userId } = parseInput(adminRemoveStaff.params, params);
    await this.team.remove(this.caller(actor, request), userId);
    return { ok: true as const };
  }
}
