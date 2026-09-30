import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  adminListTransactions,
  adminRetryRefund,
  type Transaction,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { PaymentsService } from '../application/payments.service.js';

@Controller()
@AdminAuth()
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(adminListTransactions.path)
  list(@Query() query: unknown): Promise<{ items: Transaction[]; nextCursor: string | null }> {
    return this.payments.list(parseInput(adminListTransactions.query, query));
  }

  @Post(adminRetryRefund.path)
  retry(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<Transaction> {
    const { transactionId } = parseInput(adminRetryRefund.params, params);
    return this.payments.retryRefund(
      { userId: actor.userId, meta: requestMeta(request) },
      transactionId,
    );
  }
}
