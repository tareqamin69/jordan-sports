/** "HH:mm" for minutes after midnight (wraps past 24:00). Venue-local wall-clock labels. */
export function minutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Calendar date arithmetic on YYYY-MM-DD strings (no time zone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's business date in the venue's time zone (a 01:00 moment belongs to the previous day). */
export function businessToday(
  timeZone: string,
  businessDayStartMinute: number,
  now = new Date(),
): string {
  const shifted = new Date(now.getTime() - businessDayStartMinute * 60_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
}

/** A noon-UTC Date for formatting a calendar date's weekday/day name. */
export function dateForLabel(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** ISO weekdays in display order: the Jordanian week starts on Saturday. */
export const weekdaysInDisplayOrder = [6, 7, 1, 2, 3, 4, 5] as const;

/** A Date whose UTC weekday is the given ISO weekday (for weekday names via Intl). */
export function isoWeekdayDate(isoWeekday: number): Date {
  // 2024-01-01 was a Monday.
  return new Date(Date.UTC(2024, 0, isoWeekday, 12));
}
