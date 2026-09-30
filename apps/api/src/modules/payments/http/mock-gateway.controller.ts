import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  cancelMockCheckout,
  getMockCheckout,
  payMockCheckout,
  type MockCheckout,
} from '@jordan-sports/contracts';
import { Public } from '../../../platform/auth/decorators.js';
import { Errors } from '../../../platform/http/errors.js';
import { parseInput } from '../../../platform/http/validation.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../domain/gateway.js';
import { MockGateway, type MockSession } from '../infrastructure/mock-gateway.js';

function view(s: MockSession): MockCheckout {
  return {
    amount: { amount: s.amount, currency: s.currency },
    description: s.description,
    status: s.status,
    failureCode: s.failureCode ?? null,
    returnUrl: s.returnUrl,
  };
}

/**
 * The mock gateway's payment page API (staging): the web app's /pay/test page calls it. Not found
 * when a real gateway is configured. The session id is the only key — like a hosted checkout link.
 */
@Controller()
@Public()
export class MockGatewayController {
  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}

  private mock(): MockGateway {
    if (!(this.gateway instanceof MockGateway)) throw Errors.notFound();
    return this.gateway;
  }

  @Get(getMockCheckout.path)
  async get(@Param() params: unknown): Promise<MockCheckout> {
    const { sessionId } = parseInput(getMockCheckout.params, params);
    const s = await this.mock().session(sessionId);
    if (!s) throw Errors.notFound();
    return view(s);
  }

  @Post(payMockCheckout.path)
  async pay(@Param() params: unknown, @Body() body: unknown): Promise<MockCheckout> {
    const { sessionId } = parseInput(payMockCheckout.params, params);
    const card = parseInput(payMockCheckout.body, body);
    const s = await this.mock().complete(sessionId, card);
    if (!s) throw Errors.notFound();
    return view(s);
  }

  @Post(cancelMockCheckout.path)
  async cancel(@Param() params: unknown): Promise<MockCheckout> {
    const { sessionId } = parseInput(cancelMockCheckout.params, params);
    const s = await this.mock().complete(sessionId, 'cancel');
    if (!s) throw Errors.notFound();
    return view(s);
  }
}
