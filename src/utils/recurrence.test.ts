import { describe, expect, it } from 'vitest';
import { isDueOn } from './goalPeriod';
import { recurrenceLabel } from './recurrence';

const anchor = new Date(2026, 8, 20).getTime(); // Sun 20 Sep 2026

describe('isDueOn', () => {
  it('takes a rule and an anchor, not a habit', () => {
    expect(isDueOn({ kind: 'daily' }, anchor, new Date(2026, 8, 25))).toBe(true);
  });

  it('honours weekdays (Mon=0)', () => {
    const rule = { kind: 'weekdays' as const, days: [0, 2] }; // Mon, Wed
    expect(isDueOn(rule, anchor, new Date(2026, 8, 21))).toBe(true);  // Mon
    expect(isDueOn(rule, anchor, new Date(2026, 8, 22))).toBe(false); // Tue
    expect(isDueOn(rule, anchor, new Date(2026, 8, 23))).toBe(true);  // Wed
  });

  it('counts everyN from the anchor', () => {
    const rule = { kind: 'everyN' as const, n: 3 };
    expect(isDueOn(rule, anchor, new Date(2026, 8, 20))).toBe(true);
    expect(isDueOn(rule, anchor, new Date(2026, 8, 21))).toBe(false);
    expect(isDueOn(rule, anchor, new Date(2026, 8, 23))).toBe(true);
  });

  it('is never due before the anchor', () => {
    expect(isDueOn({ kind: 'daily' }, anchor, new Date(2026, 8, 19))).toBe(false);
  });
});

describe('recurrenceLabel', () => {
  it('names the cadence', () => {
    expect(recurrenceLabel({ kind: 'daily' })).toBe('Daily');
    expect(recurrenceLabel({ kind: 'everyN', n: 3 })).toBe('Every 3 days');
    expect(recurrenceLabel({ kind: 'weekdays', days: [0, 2] })).toBe('Mon · Wed');
  });
});
