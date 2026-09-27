import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeSlots,
  openIntervals,
  type AvailabilityInput,
  type Policy,
} from '../../src/modules/scheduling/domain/availability.js';
import {
  businessDateOf,
  instantToLocal,
  isoWeekday,
  localToInstant,
} from '../../src/modules/scheduling/domain/venue-time.js';

const policy: Policy = {
  slotDurations: [60],
  startAlignmentMinutes: 30,
  minLeadMinutes: 0,
  maxAdvanceDays: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
};

// 2026-10-01 is a Thursday (ISO weekday 4).
const THU = '2026-10-01';
const EARLY = new Date('2026-09-20T00:00:00Z');

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timeZone: 'Asia/Amman',
    businessDayStartMinute: 360,
    date: THU,
    weeklyHours: [{ dayOfWeek: 4, startMinute: 16 * 60, durationMinutes: 6 * 60 }],
    overrides: [],
    closedDates: new Set(),
    busy: [],
    policy,
    now: EARLY,
    ...overrides,
  };
}

const local = (d: Date, zone = 'Asia/Amman') => instantToLocal(d, zone).time;

describe('venue time', () => {
  it('uses the IANA zone for Amman (UTC+3)', () => {
    expect(localToInstant(THU, 18 * 60, 'Asia/Amman').toISOString()).toBe(
      '2026-10-01T15:00:00.000Z',
    );
    expect(isoWeekday(THU)).toBe(4);
  });

  it('assigns after-midnight instants to the previous business day', () => {
    const oneAm = localToInstant('2026-10-02', 60, 'Asia/Amman');
    expect(businessDateOf(oneAm, 360, 'Asia/Amman')).toBe(THU);
    expect(businessDateOf(oneAm, 0, 'Asia/Amman')).toBe('2026-10-02');
  });
});

describe('computeSlots', () => {
  it('offers aligned slots that fit inside the opening window', () => {
    const slots = computeSlots(input());
    expect(slots.map((s) => local(s.start))).toEqual([
      '16:00',
      '16:30',
      '17:00',
      '17:30',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
    ]);
    expect(slots.every((s) => s.available && s.durationMinutes === 60)).toBe(true);
  });

  it('offers every allowed duration', () => {
    const slots = computeSlots(
      input({ policy: { ...policy, slotDurations: [90, 60], startAlignmentMinutes: 60 } }),
    );
    expect(slots.filter((s) => s.durationMinutes === 90).map((s) => local(s.start))).toEqual([
      '16:00',
      '17:00',
      '18:00',
      '19:00',
      '20:00',
    ]);
  });

  it('marks slots overlapping busy time as taken, but not adjacent ones', () => {
    const busy = [
      {
        start: localToInstant(THU, 18 * 60, 'Asia/Amman'),
        end: localToInstant(THU, 19 * 60, 'Asia/Amman'),
      },
    ];
    const slots = computeSlots(input({ busy }));
    const taken = slots.filter((s) => !s.available).map((s) => local(s.start));
    expect(taken).toEqual(['17:30', '18:00', '18:30']);
  });

  it('applies buffers around the requested slot', () => {
    const busy = [
      {
        start: localToInstant(THU, 18 * 60, 'Asia/Amman'),
        end: localToInstant(THU, 19 * 60, 'Asia/Amman'),
      },
    ];
    const slots = computeSlots(
      input({ busy, policy: { ...policy, bufferAfterMinutes: 15, bufferBeforeMinutes: 15 } }),
    );
    expect(slots.filter((s) => !s.available).map((s) => local(s.start))).toEqual([
      '17:00',
      '17:30',
      '18:00',
      '18:30',
      '19:00',
    ]);
  });

  it('respects the minimum lead time and the advance window', () => {
    const now = localToInstant(THU, 17 * 60 + 10, 'Asia/Amman');
    const withLead = computeSlots(input({ now, policy: { ...policy, minLeadMinutes: 60 } }));
    expect(withLead[0] && local(withLead[0].start)).toBe('18:30');
    const tooFar = computeSlots(
      input({ now: new Date('2026-09-01T00:00:00Z'), policy: { ...policy, maxAdvanceDays: 14 } }),
    );
    expect(tooFar).toEqual([]);
  });

  describe('late-night hours and the business day', () => {
    const lateNight = [{ dayOfWeek: 4, startMinute: 22 * 60, durationMinutes: 4 * 60 }]; // Thu 22:00 → Fri 02:00

    it('keeps a window that crosses midnight on the business day it starts', () => {
      const slots = computeSlots(input({ weeklyHours: lateNight }));
      expect(slots.map((s) => local(s.start))).toEqual([
        '22:00',
        '22:30',
        '23:00',
        '23:30',
        '00:00',
        '00:30',
        '01:00',
      ]);
      expect(computeSlots(input({ weeklyHours: lateNight, date: '2026-10-02' }))).toEqual([]);
    });

    it('splits the window at midnight when the business day starts at midnight', () => {
      const thu = computeSlots(input({ weeklyHours: lateNight, businessDayStartMinute: 0 }));
      const fri = computeSlots(
        input({ weeklyHours: lateNight, businessDayStartMinute: 0, date: '2026-10-02' }),
      );
      expect(thu.map((s) => local(s.start))).toEqual(['22:00', '22:30', '23:00']);
      expect(fri.map((s) => local(s.start))).toEqual(['00:00', '00:30', '01:00']);
    });
  });

  describe('overrides and holidays', () => {
    it('closes the day for a closure override', () => {
      const overrides = [
        {
          dateFrom: THU,
          dateTo: THU,
          kind: 'closed' as const,
          windows: [],
          resourceSpecific: false,
        },
      ];
      expect(computeSlots(input({ overrides }))).toEqual([]);
    });

    it('replaces weekly hours with special hours (e.g. Ramadan evenings)', () => {
      const overrides = [
        {
          dateFrom: '2026-09-25',
          dateTo: '2026-10-10',
          kind: 'hours' as const,
          windows: [{ startMinute: 20 * 60, durationMinutes: 120 }],
          resourceSpecific: false,
        },
      ];
      expect(computeSlots(input({ overrides })).map((s) => local(s.start))).toEqual([
        '20:00',
        '20:30',
        '21:00',
      ]);
    });

    it('lets a resource-specific override win over a venue-wide one', () => {
      const overrides = [
        {
          dateFrom: THU,
          dateTo: THU,
          kind: 'closed' as const,
          windows: [],
          resourceSpecific: false,
        },
        {
          dateFrom: THU,
          dateTo: THU,
          kind: 'hours' as const,
          windows: [{ startMinute: 600, durationMinutes: 60 }],
          resourceSpecific: true,
        },
      ];
      expect(computeSlots(input({ overrides })).map((s) => local(s.start))).toEqual(['10:00']);
    });

    it('closes on public holidays when the venue opts in', () => {
      expect(computeSlots(input({ closedDates: new Set([THU]) }))).toEqual([]);
    });
  });

  describe('daylight saving time (tested with Europe/Berlin; Jordan has no DST today)', () => {
    const berlin = { timeZone: 'Europe/Berlin', businessDayStartMinute: 0 };

    it('spring forward: a 6-hour window from 00:00 lasts 6 real hours and skips 02:xx', () => {
      // 2026-03-29 (Sunday): 02:00 → 03:00.
      const slots = computeSlots(
        input({
          ...berlin,
          now: new Date('2026-03-01T00:00:00Z'),
          date: '2026-03-29',
          weeklyHours: [{ dayOfWeek: 7, startMinute: 0, durationMinutes: 360 }],
          policy: { ...policy, startAlignmentMinutes: 60 },
        }),
      );
      expect(slots.map((s) => local(s.start, 'Europe/Berlin'))).toEqual([
        '00:00',
        '01:00',
        '03:00',
        '04:00',
        '05:00',
        '06:00',
      ]);
      expect(slots.every((s) => s.end.getTime() - s.start.getTime() === 3_600_000)).toBe(true);
    });

    it('fall back: the business day is 25 hours long and every slot is a real hour', () => {
      // 2026-10-25 (Sunday): 03:00 → 02:00.
      const slots = computeSlots(
        input({
          ...berlin,
          now: new Date('2026-10-01T00:00:00Z'),
          date: '2026-10-25',
          weeklyHours: [{ dayOfWeek: 7, startMinute: 0, durationMinutes: 1440 }],
          policy: { ...policy, startAlignmentMinutes: 60 },
        }),
      );
      expect(slots).toHaveLength(24);
      const times = slots.map((s) => local(s.start, 'Europe/Berlin'));
      expect(times.filter((t) => t === '02:00')).toHaveLength(2);
    });
  });

  it('property: available slots never overlap busy time and always lie inside opening hours', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            startMinute: fc.integer({ min: 0, max: 1439 }),
            durationMinutes: fc.integer({ min: 15, max: 900 }),
          }),
          { maxLength: 3 },
        ),
        fc.array(
          fc.record({
            from: fc.integer({ min: 0, max: 2 * 1440 }),
            length: fc.integer({ min: 15, max: 300 }),
          }),
          { maxLength: 5 },
        ),
        fc.constantFrom(30, 60, 90, 120),
        fc.constantFrom(15, 30, 60),
        (windows, busyRaw, duration, alignment) => {
          const dayStart = localToInstant(THU, 0, 'Asia/Amman').getTime();
          const busy = busyRaw.map((b) => ({
            start: new Date(dayStart + b.from * 60_000),
            end: new Date(dayStart + (b.from + b.length) * 60_000),
          }));
          const i = input({
            weeklyHours: windows.map((w) => ({ ...w, dayOfWeek: 4 })),
            busy,
            policy: { ...policy, slotDurations: [duration], startAlignmentMinutes: alignment },
          });
          const open = openIntervals(i);
          for (const s of computeSlots(i)) {
            expect(open.some((o) => o.start <= s.start && s.end <= o.end)).toBe(true);
            const overlapsBusy = busy.some((b) => b.start < s.end && s.start < b.end);
            expect(s.available).toBe(!overlapsBusy);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
