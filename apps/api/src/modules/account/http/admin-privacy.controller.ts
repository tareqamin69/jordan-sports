import { Controller, Get, Param } from '@nestjs/common';
import { adminExportUserData, type UserDataExport } from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, CurrentRequest } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { PrivacyService } from '../application/privacy.service.js';

/** Data-access requests: everything stored about a user, as JSON (audited). */
@Controller()
export class AdminPrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get(adminExportUserData.path)
  @AdminAuth()
  export(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @CurrentRequest() request: FastifyRequest,
  ): Promise<UserDataExport> {
    const { userId } = parseInput(adminExportUserData.params, params);
    return this.privacy.exportData({ userId: actor.userId, meta: requestMeta(request) }, userId);
  }
}
