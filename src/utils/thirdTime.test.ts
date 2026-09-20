import { describe, expect, it } from 'vitest';
import { dayKeyOf, dayStartOf, dayEndOf } from './thirdTime';

/** Local-time timestamp helper, so these tests don't depend on the TZ. */
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

describe('dayKeyOf', () => {
  it('cuts at midnight when dayEndHour is 0', () => {
    expect(dayKeyOf(at(2026, 9, 20, 23, 59), 0)).toBe('2026-09-20');
    expect(dayKeyOf(at(2026, 9, 21, 0, 1), 0)).toBe('2026-09-21');
  });

  it('keeps the small hours on the previous day when dayEndHour is 2', () => {
    expect(dayKeyOf(at(2026, 9, 21, 1, 30), 2)).toBe('2026-09-20');
    expect(dayKeyOf(at(2026, 9, 21, 1, 59), 2)).toBe('2026-09-20');
    expect(dayKeyOf(at(2026, 9, 21, 2, 0), 2)).toBe('2026-09-21');
  });

  it('is unaffected during the working day', () => {
    expect(dayKeyOf(at(2026, 9, 21, 14, 0), 2)).toBe('2026-09-21');
  });
});

describe('dayStartOf / dayEndOf', () => {
  it('bracket the day named by the key', () => {
    expect(dayStartOf('2026-09-20', 2)).toBe(at(2026, 9, 20, 2));
    expect(dayEndOf('2026-09-20', 2)).toBe(at(2026, 9, 21, 2));
  });

  it('round-trip: any instant inside the bracket maps back to the key', () => {
    const key = '2026-09-20';
    const mid = (dayStartOf(key, 3) + dayEndOf(key, 3)) / 2;
    expect(dayKeyOf(mid, 3)).toBe(key);
    expect(dayKeyOf(dayStartOf(key, 3), 3)).toBe(key);
    expect(dayKeyOf(dayEndOf(key, 3) - 1, 3)).toBe(key);
  });

  it('lands on the next boundary across a DST fall-back', () => {
    // A fixed 24h step undershoots on the day local clocks fall back an
    // hour — it lands back inside the day it started from rather than at
    // the next day's start. In a zone with no such transition this is
    // trivially the same instant as a plain +24h step, so it passes there
    // too; it only discriminates in a zone that observes one on this date.
    expect(dayEndOf('2020-10-25', 0)).toBe(at(2020, 10, 26, 0));
  });
});
