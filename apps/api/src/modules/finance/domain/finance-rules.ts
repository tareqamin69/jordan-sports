import { percentOf } from '@jordan-sports/money';

/**
 * Money rules of the CliQ marketplace (plan §4–§5). Constants here are platform defaults until the
 * admin platform-settings screen exists; amounts are integer minor units (ADR-0006).
 */

/** Deposit when the venue has not chosen one (plan §4: default 20%). */
export const DEFAULT_DEPOSIT_PERCENTAGE = 20;

/** Warn below this balance (plan D4: 10 JOD). */
export const LOW_BALANCE_THRESHOLD = 10_000;

/** Refunds unmarked this long hide the venue (plan D2). Mirrored in finance.org_takes_online_bookings. */
export const REFUND_OVERDUE_HOURS = 48;

/**
 * What the player pays now by CliQ. Every online booking needs a payment (plan D5), so a 0%
 * deposit means the full price is paid now rather than nothing.
 */
export function depositAmount(total: number, depositPercentage: number | null): number {
  const pct = depositPercentage ?? DEFAULT_DEPOSIT_PERCENTAGE;
  if (pct <= 0 || pct >= 100) return total;
  return percentOf(total, pct * 100);
}

/** Platform commission on the full booking price, rounded half-up once (plan §5, D3). */
export function commissionAmount(total: number, commissionBps: number): number {
  return percentOf(total, commissionBps);
}

export type BalanceLevel = 'ok' | 'low' | 'empty';

export function balanceLevel(balance: number, threshold = LOW_BALANCE_THRESHOLD): BalanceLevel {
  if (balance <= 0) return 'empty';
  return balance < threshold ? 'low' : 'ok';
}

/**
 * A CliQ reference as typed by a player, reduced to what identifies the transfer (case, spaces
 * and dashes ignored) so the same transfer cannot be claimed twice with cosmetic changes.
 */
export function referenceKey(reference: string): string {
  return reference.toUpperCase().replace(/[\s\-_.]/g, '');
}
