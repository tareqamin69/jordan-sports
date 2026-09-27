import { DateTime } from 'luxon';

/**
 * Venue-local time helpers (docs/architecture.md §H). Instants are UTC `Date`s; local wall-clock
 * values are always interpreted in the venue's IANA time zone via tzdata — never fixed offsets.
 */

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

export function parseDate(date: string): DateTime {
  const dt = DateTime.fromISO(date, { zone: 'UTC' });
  if (!DATE_PATTERN.test(date) || !dt.isValid) throw new Error(`Invalid date ${date}`);
  return dt;
}

export function addDays(date: string, days: number): string {
  return parseDate(date).plus({ days }).toISODate()!;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(date: string): number {
  return parseDate(date).weekday;
}

/**
 * The instant of `minute` minutes after local midnight on `date` in `zone`. Local times that do not
 * exist (DST gap) move forward to the next valid time; ambiguous times (DST overlap) resolve to
 * the earlier offset (Luxon's behaviour, covered by tests).
 */
export function localToInstant(date: string, minute: number, zone: string): Date {
  const d = parseDate(date);
  const dayOffset = Math.floor(minute / 1440);
  const m = minute - dayOffset * 1440;
  const local = DateTime.fromObject(
    { year: d.year, month: d.month, day: d.day, hour: Math.floor(m / 60), minute: m % 60 },
    { zone },
  ).plus({ days: dayOffset });
  if (!local.isValid) throw new Error(`Invalid local time in ${zone}`);
  return local.toJSDate();
}

export interface LocalParts {
  date: string;
  time: string;
  weekday: number;
}

export function instantToLocal(instant: Date, zone: string): LocalParts {
  const dt = DateTime.fromJSDate(instant, { zone });
  return { date: dt.toISODate()!, time: dt.toFormat('HH:mm'), weekday: dt.weekday };
}

/** Business day `date` runs from `startMinute` on `date` to `startMinute` on the next day. */
export function businessDayRange(
  date: string,
  startMinute: number,
  zone: string,
): { start: Date; end: Date } {
  return {
    start: localToInstant(date, startMinute, zone),
    end: localToInstant(addDays(date, 1), startMinute, zone),
  };
}

/** The business date an instant belongs to (a 01:00 slot belongs to the previous day when the business day starts at 06:00). */
export function businessDateOf(instant: Date, startMinute: number, zone: string): string {
  const shifted = DateTime.fromJSDate(instant, { zone }).minus({ minutes: startMinute });
  return shifted.toISODate()!;
}

export function todayIn(zone: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone }).toISODate()!;
}

/** Parses "HH:mm" into minutes after midnight. */
export function parseTime(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error('Invalid time');
  return Number(match[1]) * 60 + Number(match[2]);
}
