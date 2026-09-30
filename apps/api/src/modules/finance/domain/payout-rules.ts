import { DateTime } from 'luxon';
import { commissionAmount } from '../../payments/index.js';

/** Payouts are weekly: every Sunday (the first working day in Jordan), for the week before. */
export const PAYOUT_WEEKDAY = 7; // luxon: Monday = 1 … Sunday = 7

/**
 * Start of the current payout week (Sunday 00:00 in the zone). Bookings settled before it are
 * due now; later ones go out next week.
 */
export function payoutCutoff(now: Date, zone: string): Date {
  const local = DateTime.fromJSDate(now, { zone }).startOf('day');
  const back = (local.weekday - PAYOUT_WEEKDAY + 7) % 7;
  return local.minus({ days: back }).toJSDate();
}

/** The next payout day (venue-local date), for the "next payout" line. */
export function nextPayoutDate(now: Date, zone: string): string {
  return DateTime.fromJSDate(payoutCutoff(now, zone), { zone }).plus({ days: 7 }).toISODate()!;
}

/** ISO 13616 checksum: move the first four characters to the end, letters → numbers, mod 97 = 1. */
export function ibanChecksumValid(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function maskIban(iban: string): string {
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

export type EarningStatus = 'upcoming' | 'pending' | 'due' | 'paid';

/**
 * What one paid card booking earns the venue: what the player paid minus any refund (gross), the
 * platform's commission on that, and the rest (net). It becomes payable once settled: played (or
 * its time passed), or cancelled.
 */
export function earningOf(input: {
  paid: number;
  refunded: number;
  commissionBps: number;
  status: string;
  end: Date;
  cancelledAt: Date | null;
  paidOut: boolean;
  now: Date;
  cutoff: Date;
}): { gross: number; commission: number; net: number; status: EarningStatus } {
  const gross = Math.max(0, input.paid - input.refunded);
  const commission = commissionAmount(gross, input.commissionBps);
  const settledAt = input.status === 'CANCELLED' ? (input.cancelledAt ?? input.end) : input.end;
  const status: EarningStatus = input.paidOut
    ? 'paid'
    : settledAt > input.now
      ? 'upcoming'
      : settledAt < input.cutoff
        ? 'due'
        : 'pending';
  return { gross, commission, net: gross - commission, status };
}
