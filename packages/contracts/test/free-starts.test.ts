import { describe, expect, it } from 'vitest';
import { freeStarts } from '../src/index.js';

const open = [{ offsetMinutes: 600, durationMinutes: 240 }]; // 16:00–20:00 for a 06:00 day start

describe('freeStarts', () => {
  it('offers only starts where the whole booking fits inside opening hours', () => {
    expect(freeStarts(open, [], 90, 30)).toEqual([600, 630, 660, 690, 720, 750]);
  });
  it('skips times that overlap existing bookings or blocks', () => {
    const taken = [{ offsetMinutes: 660, durationMinutes: 60 }];
    expect(freeStarts(open, taken, 60, 60)).toEqual([600, 720, 780]);
  });
  it('never offers the past', () => {
    expect(freeStarts(open, [], 60, 30, 700)).toEqual([720, 750, 780]);
  });
  it('is empty when the venue is closed', () => {
    expect(freeStarts([], [], 60, 30)).toEqual([]);
  });
});
