import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import {
  adminListPayouts,
  adminMarkPayoutPaid,
  getPayoutAccount,
  getVenueEarnings,
  setPayoutAccount,
  type VenueEarnings,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { PayoutsService } from '../application/payouts.service.js';

@Controller()
@UserAuth()
export class ManagePayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get(getVenueEarnings.path)
  earnings(@Param() params: unknown, @CurrentActor() actor: Actor): Promise<VenueEarnings> {
    const { venueId } = parseInput(getVenueEarnings.params, params);
    return this.payouts.venueEarnings(actor.userId, venueId);
  }

  @Get(getPayoutAccount.path)
  async account(@Param() params: unknown, @CurrentActor() actor: Actor) {
    const { venueId } = parseInput(getPayoutAccount.params, params);
    return { account: await this.payouts.getAccount(actor.userId, venueId) };
  }

  @Put(setPayoutAccount.path)
  async setAccount(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(setPayoutAccount.params, params);
    const input = parseInput(setPayoutAccount.body, body);
    return {
      account: await this.payouts.setAccount(
        { userId: actor.userId, meta: requestMeta(request) },
        venueId,
        input,
      ),
    };
  }
}

@Controller()
@AdminAuth()
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get(adminListPayouts.path)
  list() {
    return this.payouts.adminOverview();
  }

  @Post(adminMarkPayoutPaid.path)
  @HttpCode(201)
  markPaid(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(adminMarkPayoutPaid.params, params);
    const input = parseInput(adminMarkPayoutPaid.body, body);
    return this.payouts.markPaid(
      { userId: actor.userId, meta: requestMeta(request) },
      venueId,
      input,
    );
  }
}
