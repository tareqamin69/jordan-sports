import { addDays, businessDayRange, isoWeekday, localToInstant } from './venue-time.js';

/**
 * The availability engine (docs/architecture.md §H). Pure: no I/O, no clock — every input is
 * explicit, so it can be tested exhaustively. The hold transaction remains the only authority;
 * this computes what to *show*.
 */

export interface Window {
  readonly startMinute: number;
  readonly durationMinutes: number;
}

export interface WeeklyWindow extends Window {
  /** ISO weekday of the calendar day on which the window starts. */
  readonly dayOfWeek: number;
}

export interface DateOverride {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly kind: 'closed' | 'hours';
  readonly windows: readonly Window[];
  /** True when the override targets this resource (more specific than venue-wide). */
  readonly resourceSpecific: boolean;
}

export interface Policy {
  readonly slotDurations: readonly number[];
  readonly startAlignmentMinutes: number;
  readonly minLeadMinutes: number;
  readonly maxAdvanceDays: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
}

export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

export interface AvailabilityInput {
  readonly timeZone: string;
  readonly businessDayStartMinute: number;
  /** Business date to compute (YYYY-MM-DD). */
  readonly date: string;
  readonly weeklyHours: readonly WeeklyWindow[];
  readonly overrides: readonly DateOverride[];
  /** Calendar dates that are public holidays on which the venue is closed. */
  readonly closedDates: ReadonlySet<string>;
  /** Occupied ranges on any unit of the resource (active bookings, unexpired holds, blocks). */
  readonly busy: readonly Interval[];
  readonly policy: Policy;
  readonly now: Date;
}

export interface Slot {
  readonly start: Date;
  readonly end: Date;
  readonly durationMinutes: number;
  readonly available: boolean;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Windows that start on calendar day `date` after applying overrides and holidays. */
export function windowsForCalendarDay(
  date: string,
  weekly: readonly WeeklyWindow[],
  overrides: readonly DateOverride[],
  closedDates: ReadonlySet<string>,
): Window[] {
  if (closedDates.has(date)) return [];
  const applicable = overrides.filter((o) => o.dateFrom <= date && date <= o.dateTo);
  // A resource-specific override wins over a venue-wide one; among equals, closures win.
  const specific = applicable.filter((o) => o.resourceSpecific);
  const chosen = specific.length > 0 ? specific : applicable;
  if (chosen.some((o) => o.kind === 'closed')) return [];
  if (chosen.length > 0) return chosen.flatMap((o) => o.windows);
  const weekday = isoWeekday(date);
  return weekly.filter((w) => w.dayOfWeek === weekday);
}

/** Opening intervals (UTC) that fall within business day `date`. */
export function openIntervals(
  input: Omit<AvailabilityInput, 'busy' | 'policy' | 'now'>,
): Interval[] {
  const day = businessDayRange(input.date, input.businessDayStartMinute, input.timeZone);
  const intervals: Interval[] = [];
  // Windows can start the previous calendar day and run past midnight, or start the next
  // calendar day before the business day ends.
  for (const offset of [-1, 0, 1]) {
    const calendarDay = addDays(input.date, offset);
    for (const w of windowsForCalendarDay(
      calendarDay,
      input.weeklyHours,
      input.overrides,
      input.closedDates,
    )) {
      const start = localToInstant(calendarDay, w.startMinute, input.timeZone);
      const end = new Date(start.getTime() + w.durationMinutes * 60_000);
      const clipped = {
        start: new Date(Math.max(start.getTime(), day.start.getTime())),
        end: new Date(Math.min(end.getTime(), day.end.getTime())),
      };
      if (clipped.start < clipped.end) intervals.push(clipped);
    }
  }
  return mergeIntervals(intervals);
}

export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const i of sorted) {
    const last = merged.at(-1);
    if (last && i.start <= last.end) {
      merged[merged.length - 1] = {
        start: last.start,
        end: new Date(Math.max(last.end.getTime(), i.end.getTime())),
      };
    } else {
      merged.push(i);
    }
  }
  return merged;
}

/** The occupied range a booking of [start, end) would take, including buffers. */
export function occupiedRange(
  start: Date,
  end: Date,
  policy: Pick<Policy, 'bufferBeforeMinutes' | 'bufferAfterMinutes'>,
): Interval {
  return {
    start: new Date(start.getTime() - policy.bufferBeforeMinutes * 60_000),
    end: new Date(end.getTime() + policy.bufferAfterMinutes * 60_000),
  };
}

/**
 * Bookable slots for one resource on one business date. Slots start every `startAlignmentMinutes`
 * from the start of each opening interval and must end inside it. Slots before `now + minLead` or
 * beyond the advance window are omitted; the rest are marked available or taken.
 */
export function computeSlots(input: AvailabilityInput): Slot[] {
  const { policy } = input;
  const earliest = input.now.getTime() + policy.minLeadMinutes * 60_000;
  const latest = input.now.getTime() + policy.maxAdvanceDays * 24 * 60 * 60_000;
  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (const open of openIntervals(input)) {
    for (const duration of [...policy.slotDurations].sort((a, b) => a - b)) {
      for (
        let t = open.start.getTime();
        t + duration * 60_000 <= open.end.getTime();
        t += policy.startAlignmentMinutes * 60_000
      ) {
        if (t < earliest || t > latest) continue;
        const key = `${t}:${duration}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const start = new Date(t);
        const end = new Date(t + duration * 60_000);
        const occupied = occupiedRange(start, end, policy);
        slots.push({
          start,
          end,
          durationMinutes: duration,
          available: !input.busy.some((b) => overlaps(b, occupied)),
        });
      }
    }
  }
  return slots.sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.durationMinutes - b.durationMinutes,
  );
}

/** Whether [start, end) is a slot the engine would offer (used to validate booking requests). */
export function isOfferedSlot(input: AvailabilityInput, start: Date, end: Date): boolean {
  return computeSlots(input).some(
    (s) => s.start.getTime() === start.getTime() && s.end.getTime() === end.getTime(),
  );
}
