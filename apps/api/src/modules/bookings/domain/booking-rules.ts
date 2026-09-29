import { randomInt } from 'node:crypto';

/** Unambiguous characters (no 0/O, 1/I) for references read out over the phone. */
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newReference(): string {
  let reference = '';
  for (let i = 0; i < 8; i++) reference += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return reference;
}

/** Players may hold at most this many slots at once (anti-hoarding, docs/architecture.md §G). */
export const MAX_ACTIVE_HOLDS = 2;

export interface CancellationPolicy {
  readonly cutoffHours: number;
}

/** Cancelling after this instant is a late cancellation (recorded, no penalty in the MVP). */
export function freeCancellationUntil(start: Date, policy: CancellationPolicy): Date {
  return new Date(start.getTime() - policy.cutoffHours * 3_600_000);
}

export function isLateCancellation(start: Date, policy: CancellationPolicy, now: Date): boolean {
  return now.getTime() > freeCancellationUntil(start, policy).getTime();
}

export type BookingStatus =
  'HELD' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED' | 'NO_SHOW';

/** Allowed lifecycle transitions (ADR-0005). */
const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  HELD: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CANCELLED', 'COMPLETED', 'NO_SHOW'],
  CANCELLED: [],
  EXPIRED: [],
  // The venue may still record a no-show after the booking ended (never after a check-in).
  COMPLETED: ['NO_SHOW'],
  NO_SHOW: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return transitions[from].includes(to);
}
