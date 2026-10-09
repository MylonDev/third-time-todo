import { describe, expect, it } from 'vitest';
import type { Recurrence } from '../types';
import { nextDueKey, recurrenceLabel } from './recurrence';

// 2026-10-12 is a Monday.
describe('nextDueKey', () => {
  it('daily is tomorrow', () => {
    expect(nextDueKey({ kind: 'daily' }, '2026-10-12', '2026-10-12')).toBe('2026-10-13');
  });

  it('counts from today when the item is overdue, so no backlog', () => {
    expect(nextDueKey({ kind: 'daily' }, '2026-10-05', '2026-10-12')).toBe('2026-10-13');
  });

  it('counts from the due date when finished early', () => {
    expect(nextDueKey({ kind: 'daily' }, '2026-10-14', '2026-10-12')).toBe('2026-10-15');
  });

  it('every N days', () => {
    expect(nextDueKey({ kind: 'everyN', n: 3 }, '2026-10-12', '2026-10-12')).toBe('2026-10-15');
  });

  it('weekly repeats on the weekday it was due', () => {
    expect(nextDueKey({ kind: 'weekly' }, '2026-10-12', '2026-10-12')).toBe('2026-10-19');
    // Due Monday, finished Wednesday: next Monday.
    expect(nextDueKey({ kind: 'weekly' }, '2026-10-12', '2026-10-14')).toBe('2026-10-19');
  });

  it('chosen weekdays skip to the next one that matches', () => {
    const rule: Recurrence = { kind: 'weekdays', days: [0, 2, 4] }; // Mon Wed Fri
    expect(nextDueKey(rule, '2026-10-12', '2026-10-12')).toBe('2026-10-14');
    expect(nextDueKey(rule, '2026-10-14', '2026-10-14')).toBe('2026-10-16');
    expect(nextDueKey(rule, '2026-10-16', '2026-10-16')).toBe('2026-10-19');
  });

  it('crosses month and year ends', () => {
    expect(nextDueKey({ kind: 'daily' }, '2026-12-31', '2026-12-31')).toBe('2027-01-01');
  });
});

describe('recurrenceLabel', () => {
  it('names each rule', () => {
    expect(recurrenceLabel({ kind: 'daily' })).toBe('Daily');
    expect(recurrenceLabel({ kind: 'everyN', n: 3 })).toBe('Every 3 days');
    expect(recurrenceLabel({ kind: 'weekdays', days: [4, 0] })).toBe('Mon · Fri');
  });
});
