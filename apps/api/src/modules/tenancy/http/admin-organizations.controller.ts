import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  adminAddMember,
  adminCreateOrganization,
  adminGetOrganization,
  adminListOrganizations,
  type EndpointOutput,
  type OrganizationDetail,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, CurrentRequest } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { OrganizationsService } from '../application/organizations.service.js';

@Controller()
export class AdminOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get(adminListOrganizations.path)
  @AdminAuth('organizations.read')
  list(@Query() query: unknown): Promise<EndpointOutput<typeof adminListOrganizations>> {
    const q = parseInput(adminListOrganizations.query, query);
    return this.organizations.list({ limit: q.limit, ...(q.cursor ? { cursor: q.cursor } : {}) });
  }

  @Post(adminCreateOrganization.path)
  @AdminAuth('organizations.manage')
  create(
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @CurrentRequest() request: FastifyRequest,
  ): Promise<OrganizationDetail> {
    const input = parseInput(adminCreateOrganization.body, body);
    return this.organizations.create(actor.userId, input, requestMeta(request));
  }

  @Get(adminGetOrganization.path)
  @AdminAuth('organizations.read')
  get(@Param() params: unknown): Promise<OrganizationDetail> {
    const { organizationId } = parseInput(adminGetOrganization.params, params);
    return this.organizations.get(organizationId);
  }

  @Post(adminAddMember.path)
  @AdminAuth('organizations.manage')
  addMember(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @CurrentRequest() request: FastifyRequest,
  ): Promise<OrganizationDetail> {
    const { organizationId } = parseInput(adminAddMember.params, params);
    const input = parseInput(adminAddMember.body, body);
    return this.organizations.addMember(actor.userId, organizationId, input, requestMeta(request));
  }
}
