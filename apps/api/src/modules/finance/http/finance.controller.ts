import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  adminAdjustBalance,
  adminGetBalance,
  getVenueBalance,
  type Balance,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { FinanceService } from '../application/finance.service.js';

@Controller()
@UserAuth()
export class ManageBalanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get(getVenueBalance.path)
  get(@Param() params: unknown, @CurrentActor() actor: Actor): Promise<Balance> {
    const { venueId } = parseInput(getVenueBalance.params, params);
    return this.finance.forVenue(actor.userId, venueId);
  }
}

@Controller()
export class AdminBalanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get(adminGetBalance.path)
  @AdminAuth('finance.read')
  get(@Param() params: unknown): Promise<Balance> {
    const { organizationId } = parseInput(adminGetBalance.params, params);
    return this.finance.forAdmin(organizationId);
  }

  @Post(adminAdjustBalance.path)
  @AdminAuth('finance.manage')
  adjust(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<Balance> {
    const { organizationId } = parseInput(adminAdjustBalance.params, params);
    const { amount, reason } = parseInput(adminAdjustBalance.body, body);
    return this.finance.adjust(
      { userId: actor.userId, meta: requestMeta(request) },
      organizationId,
      amount,
      reason,
    );
  }
}
