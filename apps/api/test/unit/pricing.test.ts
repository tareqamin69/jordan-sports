import { describe, expect, it } from 'vitest';
import { quote, slotPosition, type PriceRule } from '../../src/modules/pricing/domain/quote.js';
import { localToInstant } from '../../src/modules/scheduling/domain/venue-time.js';

const THU = '2026-10-01'; // ISO weekday 4
const all = [1, 2, 3, 4, 5, 6, 7];

function rule(
  partial: Partial<Omit<PriceRule, 'amounts'>> & { amounts: Record<number, number> },
): PriceRule {
  const { amounts, ...rest } = partial;
  return {
    id: 'r',
    daysOfWeek: all,
    startMinute: 0,
    endMinute: 1440,
    dateFrom: null,
    dateTo: null,
    priority: 0,
    currency: 'JOD',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...rest,
    amounts: new Map(Object.entries(amounts).map(([k, v]) => [Number(k), v])),
  };
}

const at = (hhmm: string, duration = 60, date = THU) => {
  const [h, m] = hhmm.split(':').map(Number);
  let minute = h! * 60 + m!;
  let calendarDate = date;
  if (minute < 360) {
    // After midnight: the next calendar day, same business date (business day starts 06:00).
    calendarDate = '2026-10-02';
  }
  const start = localToInstant(calendarDate, minute, 'Asia/Amman');
  if (calendarDate !== date) minute += 1440;
  return slotPosition(start, duration, date, 'Asia/Amman');
};

describe('slotPosition', () => {
  it('measures the start from local midnight of the business date', () => {
    expect(at('18:30')).toMatchObject({ weekday: 4, startOffsetMinute: 1110 });
    expect(at('01:00')).toMatchObject({ weekday: 4, startOffsetMinute: 1500, businessDate: THU });
  });
});

describe('quote', () => {
  const base = rule({ id: 'base', amounts: { 60: 20000, 90: 28000 } });
  const peak = rule({
    id: 'peak',
    startMinute: 17 * 60,
    endMinute: 23 * 60,
    priority: 10,
    amounts: { 60: 30000, 90: 42000 },
  });

  it('prices by the rule and duration that match', () => {
    expect(quote([base, peak], at('10:00'))).toEqual({
      ruleId: 'base',
      amount: 20000,
      currency: 'JOD',
    });
    expect(quote([base, peak], at('18:00', 90))).toEqual({
      ruleId: 'peak',
      amount: 42000,
      currency: 'JOD',
    });
  });

  it('prices a slot crossing a band boundary by the band it starts in (ADR-0014)', () => {
    // 16:30–18:00 starts off-peak.
    expect(quote([base, peak], at('16:30', 90))?.ruleId).toBe('base');
    // 22:30–00:00 starts in peak.
    expect(quote([base, peak], at('22:30', 90))?.ruleId).toBe('peak');
  });

  it('supports late-night bands past midnight on the business day ("Thursday night")', () => {
    const lateThursday = rule({
      id: 'late',
      daysOfWeek: [4],
      startMinute: 22 * 60,
      endMinute: 26 * 60,
      priority: 20,
      amounts: { 60: 35000 },
    });
    expect(quote([base, lateThursday], at('01:00'))?.ruleId).toBe('late');
    // Friday 01:00 business-wise is Friday's (weekday 5) — not matched by a Thursday rule.
    expect(
      quote(
        [lateThursday],
        slotPosition(
          localToInstant('2026-10-03', 60, 'Asia/Amman'),
          60,
          '2026-10-02',
          'Asia/Amman',
        ),
      ),
    ).toBeNull();
  });

  it('uses explicit weekday sets (Jordan weekend is Friday–Saturday)', () => {
    const weekend = rule({
      id: 'weekend',
      daysOfWeek: [5, 6],
      priority: 5,
      amounts: { 60: 25000 },
    });
    expect(quote([base, weekend], at('10:00'))?.ruleId).toBe('base');
    const friday = slotPosition(
      localToInstant('2026-10-02', 600, 'Asia/Amman'),
      60,
      '2026-10-02',
      'Asia/Amman',
    );
    expect(quote([base, weekend], friday)?.ruleId).toBe('weekend');
  });

  it('lets a special period win over regular bands, even with lower priority', () => {
    const ramadan = rule({
      id: 'ramadan',
      dateFrom: '2026-09-25',
      dateTo: '2026-10-05',
      priority: -5,
      amounts: { 60: 18000 },
    });
    expect(quote([base, peak, ramadan], at('18:00'))?.ruleId).toBe('ramadan');
    const outside = slotPosition(
      localToInstant('2026-10-10', 1080, 'Asia/Amman'),
      60,
      '2026-10-10',
      'Asia/Amman',
    );
    expect(quote([base, peak, ramadan], outside)?.ruleId).toBe('peak');
  });

  it('prefers the most recent rule among equals and returns null without a price', () => {
    const newer = rule({
      id: 'newer',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      amounts: { 60: 21000 },
    });
    expect(quote([base, newer], at('10:00'))?.ruleId).toBe('newer');
    expect(quote([base], at('10:00', 120))).toBeNull();
    expect(quote([], at('10:00'))).toBeNull();
  });
});
