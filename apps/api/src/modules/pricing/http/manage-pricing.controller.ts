import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import {
  archivePriceRule,
  createPriceRules,
  getVenuePricing,
  previewQuote,
  replacePriceRule,
  type VenuePricing,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { PricingService } from '../application/pricing.service.js';

@Controller()
@UserAuth()
export class ManagePricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get(getVenuePricing.path)
  list(@Param() params: unknown, @CurrentActor() actor: Actor): Promise<VenuePricing> {
    return this.pricing.pricing(actor.userId, parseInput(getVenuePricing.params, params).venueId);
  }

  @Post(createPriceRules.path)
  create(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenuePricing> {
    const { venueId } = parseInput(createPriceRules.params, params);
    const input = parseInput(createPriceRules.body, body);
    return this.pricing.create(
      { userId: actor.userId, meta: requestMeta(request) },
      venueId,
      input.resourceIds,
      input.rule,
    );
  }

  @Put(replacePriceRule.path)
  replace(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenuePricing> {
    const { ruleId } = parseInput(replacePriceRule.params, params);
    const input = parseInput(replacePriceRule.body, body);
    return this.pricing.replace(
      { userId: actor.userId, meta: requestMeta(request) },
      ruleId,
      input.rule,
    );
  }

  @Delete(archivePriceRule.path)
  archive(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenuePricing> {
    const { ruleId } = parseInput(archivePriceRule.params, params);
    return this.pricing.archive({ userId: actor.userId, meta: requestMeta(request) }, ruleId);
  }

  @Get(previewQuote.path)
  preview(@Param() params: unknown, @Query() query: unknown, @CurrentActor() actor: Actor) {
    const { resourceId } = parseInput(previewQuote.params, params);
    const q = parseInput(previewQuote.query, query);
    return this.pricing.preview(actor.userId, resourceId, q.date, q.startTime, q.durationMinutes);
  }
}
