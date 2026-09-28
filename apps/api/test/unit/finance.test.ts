import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  balanceLevel,
  commissionAmount,
  DEFAULT_DEPOSIT_PERCENTAGE,
  depositAmount,
  LOW_BALANCE_THRESHOLD,
  referenceKey,
} from '../../src/modules/finance/index.js';

const fils = fc.integer({ min: 1, max: 10_000_000 });

describe('deposit', () => {
  it('uses the venue percentage, rounded half-up to a whole fils', () => {
    expect(depositAmount(20_000, 20)).toBe(4_000);
    expect(depositAmount(12_345, 20)).toBe(2_469); // 2469.0
    expect(depositAmount(12_347, 20)).toBe(2_469); // 2469.4 → down
    expect(depositAmount(12_348, 20)).toBe(2_470); // 2469.6 → up
    expect(depositAmount(5, 50)).toBe(3); // 2.5 → up (half-up)
  });

  it('defaults to 20% when the venue has not chosen', () => {
    expect(DEFAULT_DEPOSIT_PERCENTAGE).toBe(20);
    expect(depositAmount(20_000, null)).toBe(4_000);
  });

  it('asks for the full price at 0% or 100% (every online booking needs a payment, D5)', () => {
    expect(depositAmount(20_000, 0)).toBe(20_000);
    expect(depositAmount(20_000, 100)).toBe(20_000);
  });

  it('is never more than the price and never negative (property)', () => {
    fc.assert(
      fc.property(fils, fc.integer({ min: 0, max: 100 }), (total, pct) => {
        const d = depositAmount(total, pct);
        return Number.isSafeInteger(d) && d >= 0 && d <= total;
      }),
    );
  });

  it('deposit + remainder always equals the price exactly (property)', () => {
    fc.assert(
      fc.property(fils, fc.integer({ min: 1, max: 99 }), (total, pct) => {
        const d = depositAmount(total, pct);
        return d + (total - d) === total && Math.abs(d * 100 - total * pct) <= 50;
      }),
    );
  });
});

describe('commission', () => {
  it('is 8% of the full price by default, rounded half-up once', () => {
    expect(commissionAmount(20_000, 800)).toBe(1_600);
    expect(commissionAmount(28_000, 800)).toBe(2_240);
    expect(commissionAmount(6_250, 800)).toBe(500);
    expect(commissionAmount(6_256, 800)).toBe(500); // 500.48 → down
    expect(commissionAmount(6_257, 800)).toBe(501); // 500.56 → up
    expect(commissionAmount(1, 5_000)).toBe(1); // 0.5 → up
    expect(commissionAmount(20_000, 0)).toBe(0);
  });

  it('is within half a fils of the exact value and never above the price (property)', () => {
    fc.assert(
      fc.property(fils, fc.integer({ min: 0, max: 5_000 }), (total, bps) => {
        const c = commissionAmount(total, bps);
        const exactTimes10k = total * bps;
        return (
          Number.isSafeInteger(c) &&
          c >= 0 &&
          c <= total &&
          Math.abs(c * 10_000 - exactTimes10k) <= 5_000
        );
      }),
    );
  });

  it('is monotonic in the price (property)', () => {
    fc.assert(
      fc.property(fils, fils, fc.integer({ min: 0, max: 5_000 }), (a, b, bps) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return commissionAmount(lo, bps) <= commissionAmount(hi, bps);
      }),
    );
  });
});

describe('balance level', () => {
  it('is empty at zero or below, low under the 10 JOD threshold, ok otherwise', () => {
    expect(LOW_BALANCE_THRESHOLD).toBe(10_000);
    expect(balanceLevel(-1)).toBe('empty');
    expect(balanceLevel(0)).toBe('empty');
    expect(balanceLevel(1)).toBe('low');
    expect(balanceLevel(9_999)).toBe('low');
    expect(balanceLevel(10_000)).toBe('ok');
  });
});

describe('CliQ reference key', () => {
  it('ignores case, spaces and separators so one transfer cannot be claimed twice', () => {
    expect(referenceKey('ab12-cd 34')).toBe('AB12CD34');
    expect(referenceKey('AB12CD34')).toBe(referenceKey(' ab_12.cd-34 '));
  });
});
