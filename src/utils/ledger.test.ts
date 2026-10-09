import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../types';
import {
  applyFix,
  balanceOf,
  fixRefusal,
  MAX_FIX_MS,
  paint,
  runningEntry,
  startState,
  stopTimer,
  totalsFor,
} from './ledger';
import { windowOf } from './time';

const MIN = 60_000;
const T0 = new Date(2026, 9, 12, 10, 0, 0).getTime();
const at = (min: number) => T0 + min * MIN;

let n = 0;
const entry = (state: 'should' | 'want', from: number, to: number | null): TimeEntry => ({
  id: `e${++n}`,
  state,
  startedAt: at(from),
  endedAt: to === null ? null : at(to),
  updatedAt: 0,
});

/** The live entries as [state, from, to] in minutes, for readable assertions. */
const shape = (entries: TimeEntry[]) =>
  entries
    .filter((e) => e.deletedAt === undefined)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((e) => [e.state, (e.startedAt - T0) / MIN, e.endedAt === null ? null : (e.endedAt - T0) / MIN]);

describe('totals and balance', () => {
  const win = windowOf('2026-10-12', 0);

  it('earns one second of want for every three of should', () => {
    const t = totalsFor([entry('should', 0, 60)], win, at(120));
    expect(balanceOf(t)).toBe(20 * MIN);
  });

  it('spends one second of want for every second of want', () => {
    const t = totalsFor([entry('should', 0, 60), entry('want', 60, 90)], win, at(120));
    expect(balanceOf(t)).toBe(-10 * MIN);
  });

  it('counts the running entry up to now', () => {
    const t = totalsFor([entry('should', 0, null)], win, at(30));
    expect(t.shouldMs).toBe(30 * MIN);
  });

  it('ignores tombstoned entries', () => {
    const dead = { ...entry('should', 0, 60), deletedAt: 1 };
    expect(totalsFor([dead], win, at(120)).shouldMs).toBe(0);
  });

  it('clips an entry to the day it is being counted for', () => {
    // 23:00 to 01:00 across midnight: an hour on each day.
    const across: TimeEntry = {
      id: 'x',
      state: 'should',
      startedAt: new Date(2026, 9, 12, 23, 0).getTime(),
      endedAt: new Date(2026, 9, 13, 1, 0).getTime(),
      updatedAt: 0,
    };
    const now = new Date(2026, 9, 13, 12, 0).getTime();
    expect(totalsFor([across], windowOf('2026-10-12', 0), now).shouldMs).toBe(60 * MIN);
    expect(totalsFor([across], windowOf('2026-10-13', 0), now).shouldMs).toBe(60 * MIN);
  });

  it('respects a day that ends after midnight', () => {
    const e: TimeEntry = {
      id: 'x',
      state: 'should',
      startedAt: new Date(2026, 9, 13, 0, 30).getTime(),
      endedAt: new Date(2026, 9, 13, 1, 30).getTime(),
      updatedAt: 0,
    };
    const now = new Date(2026, 9, 13, 12, 0).getTime();
    expect(totalsFor([e], windowOf('2026-10-12', 3), now).shouldMs).toBe(60 * MIN);
    expect(totalsFor([e], windowOf('2026-10-13', 3), now).shouldMs).toBe(0);
  });
});

describe('start and stop', () => {
  it('starts a state and opens a running entry', () => {
    const out = startState([], 'should', at(0));
    expect(shape(out)).toEqual([['should', 0, null]]);
  });

  it('switching closes the running entry and opens the next', () => {
    const out = startState(startState([], 'should', at(0)), 'want', at(30));
    expect(shape(out)).toEqual([
      ['should', 0, 30],
      ['want', 30, null],
    ]);
  });

  it('starting the running state changes nothing', () => {
    const once = startState([], 'should', at(0));
    expect(startState(once, 'should', at(5))).toBe(once);
  });

  it('stops by closing the running entry', () => {
    const out = stopTimer(startState([], 'want', at(0)), at(12));
    expect(shape(out)).toEqual([['want', 0, 12]]);
    expect(runningEntry(out)).toBeUndefined();
  });

  it('removes an entry that would be empty', () => {
    const out = stopTimer(startState([], 'want', at(0)), at(0));
    expect(shape(out)).toEqual([]);
  });
});

describe('paint', () => {
  it('overwrites the middle of an entry, splitting it', () => {
    const out = paint([entry('should', 0, 60)], at(20), at(30), 'want', at(60));
    expect(shape(out)).toEqual([
      ['should', 0, 20],
      ['want', 20, 30],
      ['should', 30, 60],
    ]);
  });

  it('trims entries that straddle the edges', () => {
    const out = paint([entry('should', 0, 30), entry('want', 30, 60)], at(20), at(40), 'rest', at(60));
    expect(shape(out)).toEqual([
      ['should', 0, 20],
      ['want', 40, 60],
    ]);
  });

  it('tombstones entries inside the range rather than dropping them', () => {
    const out = paint([entry('should', 10, 20)], at(0), at(30), 'rest', at(60));
    expect(out).toHaveLength(1);
    expect(out[0].deletedAt).toBe(at(60));
  });

  it('merges neighbours of the same state', () => {
    const out = paint([entry('should', 0, 20), entry('should', 30, 60)], at(20), at(30), 'should', at(60));
    expect(shape(out)).toEqual([['should', 0, 60]]);
  });

  it('keeps a running entry running past the range', () => {
    const out = paint([entry('should', 0, null)], at(10), at(20), 'want', at(30));
    expect(shape(out)).toEqual([
      ['should', 0, 10],
      ['want', 10, 20],
      ['should', 20, null],
    ]);
  });

  it('ignores an empty range', () => {
    const before = [entry('should', 0, 10)];
    expect(paint(before, at(5), at(5), 'want', at(10))).toBe(before);
  });
});

describe('applyFix', () => {
  const running = () => startState([], 'should', at(0));

  it('I was on want for the last 20 minutes and still am', () => {
    const out = applyFix(running(), { ms: 20 * MIN, was: 'want', then: 'want' }, at(60));
    expect(shape(out)).toEqual([
      ['should', 0, 40],
      ['want', 40, null],
    ]);
  });

  it('I was on want for the last 20 minutes and am back on should', () => {
    const out = applyFix(running(), { ms: 20 * MIN, was: 'want', then: 'should' }, at(60));
    expect(shape(out)).toEqual([
      ['should', 0, 40],
      ['want', 40, 60],
      ['should', 60, null],
    ]);
  });

  it('I forgot to stop twenty minutes ago', () => {
    const out = applyFix(running(), { ms: 20 * MIN, was: 'rest', then: 'rest' }, at(60));
    expect(shape(out)).toEqual([['should', 0, 40]]);
    expect(runningEntry(out)).toBeUndefined();
  });

  it('can reach back over an earlier switch', () => {
    const entries = startState(running(), 'want', at(50));
    const out = applyFix(entries, { ms: 30 * MIN, was: 'should', then: 'want' }, at(60));
    expect(shape(out)).toEqual([
      ['should', 0, 60],
      ['want', 60, null],
    ]);
  });

  it('moves the balance by the time reassigned', () => {
    const win = windowOf('2026-10-12', 0);
    const before = totalsFor(running(), win, at(60));
    const out = applyFix(running(), { ms: 20 * MIN, was: 'want', then: 'should' }, at(60));
    const after = totalsFor(out, win, at(60));
    expect(balanceOf(before)).toBe(20 * MIN);
    // 40 min should earns 13m20s; 20 min want spends 20.
    expect(balanceOf(after)).toBe((40 * MIN) / 3 - 20 * MIN);
  });
});

describe('fixRefusal', () => {
  it('refuses nothing and the impossible', () => {
    expect(fixRefusal({ ms: 0 })).not.toBeNull();
    expect(fixRefusal({ ms: -5 })).not.toBeNull();
    expect(fixRefusal({ ms: Number.NaN })).not.toBeNull();
    expect(fixRefusal({ ms: MAX_FIX_MS + 1 })).not.toBeNull();
    expect(fixRefusal({ ms: 10 * MIN })).toBeNull();
  });
});
