import { describe, expect, it } from 'vitest';
import { axisTicks } from '../src/index.js';

describe('axisTicks', () => {
  it('uses whole numbers for small counts (never 0.5)', () => {
    expect(axisTicks(1)).toEqual([0, 1]);
    expect(axisTicks(2)).toEqual([0, 1, 2]);
    expect(axisTicks(0)).toEqual([0, 1]);
    for (const t of axisTicks(3)) expect(Number.isInteger(t)).toBe(true);
  });
  it('rounds larger counts to 1, 2, 5 steps', () => {
    expect(axisTicks(9)).toEqual([0, 5, 10]);
    expect(axisTicks(166)).toEqual([0, 100, 200]);
  });
  it('never goes below the minimum step (whole dinars in fils)', () => {
    expect(axisTicks(0, 1000)).toEqual([0, 1000]);
    expect(axisTicks(400, 1000)).toEqual([0, 1000]);
    for (const t of axisTicks(2500, 1000)) expect(t % 1000).toBe(0);
  });
});
