import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type {
  CheckoutRequest,
  CheckoutSession,
  CheckoutStatus,
  PaymentGateway,
  RefundRequest,
  RefundResult,
} from '../domain/gateway.js';
import { mockCardOutcome } from '../domain/test-cards.js';

const TTL_SECONDS = 24 * 60 * 60;
const key = (id: string) => `mockpay:${id}`;

export interface MockSession {
  id: string;
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  status: 'pending' | 'succeeded' | 'failed';
  brand?: 'visa' | 'mastercard';
  last4?: string;
  failureCode?: string;
  refunded: number;
}

/**
 * A stand-in for the card gateway on staging and in tests (ADR-0020): its "hosted payment page" is
 * the web app's test page (/pay/test/:sessionId), which accepts only the test cards. Sessions
 * live in Redis for a day. Never allowed in production (config refuses it).
 */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock';

  constructor(private readonly redis: Redis) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const session: MockSession = {
      id: randomUUID(),
      transactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      description: request.description,
      returnUrl: request.returnUrl,
      status: 'pending',
      refunded: 0,
    };
    await this.save(session);
    return {
      sessionId: session.id,
      // The test page lives on the web app the player came from (same origin as the return URL).
      redirectUrl: `${new URL(request.returnUrl).origin}/${request.locale}/pay/test/${session.id}`,
    };
  }

  async getCheckout(sessionId: string): Promise<CheckoutStatus> {
    const s = await this.session(sessionId);
    if (!s) return { status: 'failed', failureCode: 'session_not_found' };
    if (s.status === 'succeeded') return { status: 'succeeded', brand: s.brand!, last4: s.last4! };
    if (s.status === 'failed') return { status: 'failed', failureCode: s.failureCode ?? 'failed' };
    return { status: 'pending' };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const s = await this.session(request.sessionId);
    if (!s || s.status !== 'succeeded') return { status: 'failed', failureCode: 'not_captured' };
    if (s.refunded + request.amount > s.amount) {
      return { status: 'failed', failureCode: 'amount_exceeds_charge' };
    }
    s.refunded += request.amount;
    await this.save(s);
    return { status: 'succeeded', refundRef: `mockref_${request.refundId}` };
  }

  // The test payment page (MockGatewayController).

  async session(id: string): Promise<MockSession | null> {
    const raw = await this.redis.get(key(id));
    return raw ? (JSON.parse(raw) as MockSession) : null;
  }

  /** The player pressed "pay" (a test card) or "cancel" on the test page. */
  async complete(
    id: string,
    input: { number: string; expiry: string; cvc: string } | 'cancel',
    now = new Date(),
  ): Promise<MockSession | null> {
    const s = await this.session(id);
    if (!s) return null;
    if (s.status !== 'pending') return s;
    if (input === 'cancel') {
      s.status = 'failed';
      s.failureCode = 'cancelled';
    } else {
      const outcome = mockCardOutcome(input, now);
      // A mistyped card stays on the page to try again; a decline ends the attempt.
      if (outcome.status === 'failed' && outcome.failureCode.startsWith('invalid_')) {
        return { ...s, failureCode: outcome.failureCode };
      }
      if (outcome.status === 'succeeded') {
        s.status = 'succeeded';
        s.brand = outcome.brand;
        s.last4 = outcome.last4;
      } else {
        s.status = 'failed';
        s.failureCode = outcome.failureCode;
      }
    }
    await this.save(s);
    return s;
  }

  private async save(s: MockSession): Promise<void> {
    await this.redis.set(key(s.id), JSON.stringify(s), 'EX', TTL_SECONDS);
  }
}
