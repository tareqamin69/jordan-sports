import { percentOf } from '@jordan-sports/money';

/** Refunds reach the card after this many business days (shown to players). */
export const REFUND_BUSINESS_DAYS = { min: 5, max: 10 } as const;

/** While the player is on the payment page the hold is kept at least this long. */
export const CHECKOUT_MINUTES = 15;

/** A checkout nobody finished is given up after this long (the worker checks it once more). */
export const CHECKOUT_ABANDONED_MINUTES = 60;

export type LateRefundPercent = 0 | 50 | 100;
export const LATE_REFUND_PERCENTS: readonly LateRefundPercent[] = [0, 50, 100];

export type RefundReason = 'customer_free' | 'customer_late' | 'venue' | 'admin' | 'expired';

/**
 * What goes back to the card when a paid booking is cancelled: everything inside the free window,
 * when the venue or the platform cancels, or when the payment arrived after the hold expired; the
 * venue's late-cancellation percentage otherwise. Integer minor units, rounded half-up once.
 */
export function refundAmount(
  paid: number,
  reason: RefundReason,
  lateRefundPercent: LateRefundPercent,
): number {
  if (reason !== 'customer_late') return paid;
  return lateRefundPercent === 100 ? paid : percentOf(paid, lateRefundPercent * 100);
}

/** Platform commission on what the venue keeps, rounded half-up once. */
export function commissionAmount(gross: number, commissionBps: number): number {
  return percentOf(gross, commissionBps);
}
