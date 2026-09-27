import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  formatMoney,
  money,
  parseMajor,
  percentOf,
  subtract,
  toMajorString,
} from '../src/index.js';

describe('formatMoney (approved display format)', () => {
  it('formats JOD with three decimals in Arabic and English', () => {
    expect(formatMoney(money(25000, 'JOD'), 'ar')).toBe('25.000 د.أ');
    expect(formatMoney(money(25000, 'JOD'), 'en')).toBe('JOD 25.000');
    expect(formatMoney(money(1250500, 'JOD'), 'en')).toBe('JOD 1,250.500');
    expect(formatMoney(money(5, 'JOD'), 'ar')).toBe('0.005 د.أ');
  });

  it('never uses Eastern Arabic digits', () => {
    expect(formatMoney(money(1234567, 'JOD'), 'ar')).not.toMatch(/[٠-٩]/);
  });

  it('handles negative amounts and other currencies', () => {
    expect(toMajorString(-1500, 'JOD')).toBe('-1.500');
    expect(formatMoney(money(1999, 'USD'), 'en')).toBe('USD 19.99');
  });
});

describe('parseMajor', () => {
  it.each([
    ['25', 25000],
    ['25.5', 25500],
    ['25.125', 25125],
    ['0.005', 5],
    ['1,250', 1250000],
    ['٢٥٫٥', 25500],
  ])('%s → %i fils', (input, expected) => {
    expect(parseMajor(input, 'JOD')).toBe(expected);
  });

  it.each(['', 'abc', '25.1234', '-5', '1e3', '25.'])('rejects %s', (input) => {
    expect(parseMajor(input, 'JOD')).toBeNull();
  });

  it('round-trips with toMajorString', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 ** 12 }), (fils) => {
        expect(parseMajor(toMajorString(fils, 'JOD'), 'JOD')).toBe(fils);
      }),
    );
  });
});

describe('arithmetic', () => {
  it('adds and subtracts only the same currency', () => {
    expect(add(money(1000, 'JOD'), money(500, 'JOD'))).toEqual(money(1500, 'JOD'));
    expect(subtract(money(1000, 'JOD'), money(500, 'JOD'))).toEqual(money(500, 'JOD'));
    expect(() => add(money(1, 'JOD'), money(1, 'USD'))).toThrow(/Currency/);
  });

  it('rejects non-integer amounts', () => {
    expect(() => money(1.5, 'JOD')).toThrow();
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, 'JOD')).toThrow();
  });
});

describe('percentOf (half-up, applied once)', () => {
  it.each([
    [20000, 1000, 2000],
    [12345, 1000, 1235], // 1234.5 → 1235
    [12344, 1000, 1234],
    [1, 5000, 1], // 0.5 → 1
    [0, 1500, 0],
  ])('%i × %i bps = %i', (amount, bps, expected) => {
    expect(percentOf(amount, bps)).toBe(expected);
  });
});

describe('allocate (largest remainder)', () => {
  it('splits 10 JOD three ways with the remainder on the first part', () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });

  it('splits 24 JOD eight ways exactly', () => {
    expect(allocate(24000, Array(8).fill(1))).toEqual(Array(8).fill(3000));
  });

  it('property: parts always sum to the total and differ from the exact share by less than 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 9 }),
        fc
          .array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 })
          .filter((w) => w.some((x) => x > 0)),
        (total, weights) => {
          const parts = allocate(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          const sum = weights.reduce((a, b) => a + b, 0);
          parts.forEach((p, i) =>
            expect(Math.abs(p - (total * weights[i]!) / sum)).toBeLessThan(1),
          );
        },
      ),
    );
  });
});
