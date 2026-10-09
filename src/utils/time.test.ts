import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  dayKeyOf,
  describeDay,
  formatClock,
  formatDuration,
  shiftDayKey,
  weekdayOfKey,
  windowOf,
} from './time';

describe('time formatting', () => {
  it('formats a stopwatch', () => {
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-65_000)).toBe('1:05');
  });

  it('formats a duration', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(120 * 60_000)).toBe('2h');
    expect(formatDuration(96 * 60_000)).toBe('1h 36m');
  });
});

describe('day keys', () => {
  it('rolls at midnight by default', () => {
    expect(dayKeyOf(new Date(2026, 9, 12, 23, 59).getTime(), 0)).toBe('2026-10-12');
    expect(dayKeyOf(new Date(2026, 9, 13, 0, 1).getTime(), 0)).toBe('2026-10-13');
  });

  it('belongs to the previous day until the day end hour', () => {
    expect(dayKeyOf(new Date(2026, 9, 13, 0, 30).getTime(), 3)).toBe('2026-10-12');
    expect(dayKeyOf(new Date(2026, 9, 13, 3, 0).getTime(), 3)).toBe('2026-10-13');
  });

  it('shifts across month ends', () => {
    expect(shiftDayKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('gives the weekday, Monday first', () => {
    expect(weekdayOfKey('2026-10-12')).toBe(0);
    expect(weekdayOfKey('2026-10-18')).toBe(6);
  });

  it('measures whole days', () => {
    expect(daysBetween('2026-10-09', '2026-10-12')).toBe(3);
    expect(daysBetween('2026-10-12', '2026-10-09')).toBe(-3);
  });

  it('windows a day by its end hour', () => {
    const w = windowOf('2026-10-12', 3);
    expect(w.start).toBe(new Date(2026, 9, 12, 3).getTime());
    expect(w.end).toBe(new Date(2026, 9, 13, 3).getTime());
  });

  it('names nearby days', () => {
    expect(describeDay('2026-10-12', '2026-10-12')).toBe('Today');
    expect(describeDay('2026-10-13', '2026-10-12')).toBe('Tomorrow');
    expect(describeDay('2026-10-11', '2026-10-12')).toBe('Yesterday');
  });
});
