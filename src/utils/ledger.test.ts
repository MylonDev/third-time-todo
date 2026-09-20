import { describe, expect, it } from 'vitest';
import { bankOf, durationOf, workMsOf, breakMsOf, entriesOverlap } from './ledger';
import type { TimeEntry } from '../types';

const MIN = 60_000;
let n = 0;
function work(fromMin: number, toMin: number, mode: TimeEntry['mode'] = 'third'): TimeEntry {
  return { id: `w${n++}`, kind: 'work', startedAt: fromMin * MIN, endedAt: toMin * MIN, mode };
}
function brk(fromMin: number, toMin: number): TimeEntry {
  return { id: `b${n++}`, kind: 'break', startedAt: fromMin * MIN, endedAt: toMin * MIN, mode: 'third' };
}

describe('bankOf', () => {
  it('is zero with no entries', () => {
    expect(bankOf([])).toBe(0);
  });

  it('earns at the entry\'s own ratio', () => {
    // 60 min at 1:3 earns 20 min.
    expect(bankOf([work(0, 60, 'third')])).toBe(20 * MIN);
    // 60 min at 1:2 earns 30.
    expect(bankOf([work(0, 60, 'half')])).toBe(30 * MIN);
  });

  it('mixes ratios without rewriting history', () => {
    // An hour earned at 1:3, then an hour at 1:2 — 20 + 30, not 2 × either.
    expect(bankOf([work(0, 60, 'third'), work(60, 120, 'half')])).toBe(50 * MIN);
  });

  it('spends break time', () => {
    expect(bankOf([work(0, 60, 'third'), brk(60, 70)])).toBe(10 * MIN);
  });

  it('goes into debt', () => {
    expect(bankOf([work(0, 30, 'third'), brk(30, 60)])).toBe(-20 * MIN);
  });

  it('counts an open work segment as it runs', () => {
    const open = { kind: 'work' as const, startedAt: 0, mode: 'third' as const };
    expect(bankOf([], open, 60 * MIN)).toBe(20 * MIN);
  });

  it('counts an open break as it runs', () => {
    const open = { kind: 'break' as const, startedAt: 60 * MIN, mode: 'third' as const };
    expect(bankOf([work(0, 60, 'third')], open, 70 * MIN)).toBe(10 * MIN);
  });

  it('ignores an open segment whose start is in the future', () => {
    const open = { kind: 'work' as const, startedAt: 90 * MIN, mode: 'third' as const };
    expect(bankOf([work(0, 60, 'third')], open, 60 * MIN)).toBe(20 * MIN);
  });
});

describe('sums', () => {
  it('separate work from break', () => {
    const day = [work(0, 60), brk(60, 70), work(70, 100)];
    expect(workMsOf(day)).toBe(90 * MIN);
    expect(breakMsOf(day)).toBe(10 * MIN);
    expect(durationOf(day[0])).toBe(60 * MIN);
  });
});

describe('entriesOverlap', () => {
  it('is false for touching entries', () => {
    expect(entriesOverlap(work(0, 60), brk(60, 70))).toBe(false);
  });
  it('is true when they cross', () => {
    expect(entriesOverlap(work(0, 60), work(59, 70))).toBe(true);
  });
  it('is true when one contains the other', () => {
    expect(entriesOverlap(work(0, 60), work(10, 20))).toBe(true);
  });
});
