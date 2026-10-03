/** Google Places `regularOpeningHours.periods` (day 0 = Sunday … 6 = Saturday). */
export interface GooglePeriod {
  readonly open?: { day?: number; hour?: number; minute?: number };
  readonly close?: { day?: number; hour?: number; minute?: number };
}

export interface WeeklyWindowOut {
  dayOfWeek: number;
  startMinute: number;
  durationMinutes: number;
}

const WEEK = 7 * 1440;

/**
 * Google opening periods → our weekly windows (ISO weekday 1 = Monday, minutes from midnight, a
 * window may run past midnight up to 24 h). "Open 24 hours" (one period without a close) becomes
 * a full day every day. Windows shorter than 15 minutes are dropped.
 */
export function toWeeklyWindows(periods: readonly GooglePeriod[] | undefined): WeeklyWindowOut[] {
  if (!periods?.length) return [];
  const only = periods[0]!;
  if (periods.length === 1 && only.open && !only.close) {
    return [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      dayOfWeek: d,
      startMinute: 0,
      durationMinutes: 1440,
    }));
  }
  const out: WeeklyWindowOut[] = [];
  for (const p of periods) {
    if (!p.open || !p.close || p.open.day === undefined || p.close.day === undefined) continue;
    const start = p.open.day * 1440 + (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);
    const end = p.close.day * 1440 + (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0);
    const duration = Math.min(1440, (((end - start) % WEEK) + WEEK) % WEEK || 1440);
    if (duration < 15) continue;
    out.push({
      dayOfWeek: p.open.day === 0 ? 7 : p.open.day,
      startMinute: (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0),
      durationMinutes: duration,
    });
  }
  return out;
}
