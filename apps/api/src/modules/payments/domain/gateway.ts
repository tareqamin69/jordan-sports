/**
 * The card payment gateway port (ADR-0020). Jorena uses the gateway's hosted checkout: the player
 * types the card on the gateway's page, so card numbers never reach our servers — we only learn
 * the outcome, the card brand and its last four digits.
 *
 * Staging uses the mock gateway (test cards); the real one (MEPS or a bank acquirer) is another
 * implementation of this interface, chosen by PAYMENT_GATEWAY.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type CardBrand = 'visa' | 'mastercard';

export interface CheckoutRequest {
  /** Our transaction id (idempotency key at the gateway). */
  readonly transactionId: string;
  readonly amount: number;
  readonly currency: string;
  /** Shown on the payment page, e.g. "Jorena — booking ABCD2345". */
  readonly description: string;
  /** Where the gateway sends the player back (success, failure or cancel alike). */
  readonly returnUrl: string;
  readonly locale: 'ar' | 'en';
}

export interface CheckoutSession {
  readonly sessionId: string;
  /** The hosted payment page. */
  readonly redirectUrl: string;
}

export type CheckoutStatus =
  | { readonly status: 'pending' }
  | { readonly status: 'succeeded'; readonly brand: CardBrand; readonly last4: string }
  | { readonly status: 'failed'; readonly failureCode: string };

export interface RefundRequest {
  /** Our refund transaction id (idempotency key at the gateway). */
  readonly refundId: string;
  /** The charge's checkout session. */
  readonly sessionId: string;
  readonly amount: number;
  readonly currency: string;
}

export type RefundResult =
  | { readonly status: 'succeeded'; readonly refundRef: string }
  | { readonly status: 'pending'; readonly refundRef: string }
  | { readonly status: 'failed'; readonly failureCode: string };

export interface PaymentGateway {
  /** Stored on every transaction (`payment.transactions.gateway`). */
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  getCheckout(sessionId: string): Promise<CheckoutStatus>;
  refund(request: RefundRequest): Promise<RefundResult>;
}
