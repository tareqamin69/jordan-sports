/** A range on a resource's day, in minutes from the start of the business day. */
export interface DayRange {
  readonly offsetMinutes: number;
  readonly durationMinutes: number;
}

/**
 * Start times (minutes from the business day start) at which a booking of `duration` minutes fits
 * entirely inside an opening range and does not overlap anything already taken, stepping by the
 * venue's start alignment from each range start. Nothing before `notBefore` is offered (e.g. now).
 * Used by the phone-booking form so it only offers real, free times (QA #16).
 */
export function freeStarts(
  open: readonly DayRange[],
  taken: readonly DayRange[],
  duration: number,
  step: number,
  notBefore = Number.NEGATIVE_INFINITY,
): number[] {
  const out = new Set<number>();
  for (const range of open) {
    const end = range.offsetMinutes + range.durationMinutes;
    for (let start = range.offsetMinutes; start + duration <= end; start += step) {
      if (start < notBefore) continue;
      const clash = taken.some(
        (t) => start < t.offsetMinutes + t.durationMinutes && t.offsetMinutes < start + duration,
      );
      if (!clash) out.add(start);
    }
  }
  return [...out].sort((a, b) => a - b);
}
