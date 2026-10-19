import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../types';
import {
  activeEntry,
  applyFix,
  balanceOf,
  balanceWindow,
  fixRefusal,
  MAX_FIX_MS,
  paint,
  runningEntry,
  settleTimed,
  startState,
  startTimed,
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

/** A Timed entry set to run `planned` minutes; `to` is when it was closed, if it was. */
const timed = (from: number, planned: number, to: number | null = null): TimeEntry => ({
  ...entry('want', from, to),
  state: 'timed',
  plannedMs: planned * MIN,
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
    const out = paint([entry('should', 0, 30), entry('want', 30, 60)], at(20), at(40), 'stopped', at(60));
    expect(shape(out)).toEqual([
      ['should', 0, 20],
      ['want', 40, 60],
    ]);
  });

  it('tombstones entries inside the range rather than dropping them', () => {
    const out = paint([entry('should', 10, 20)], at(0), at(30), 'stopped', at(60));
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
    const out = applyFix(running(), { ms: 20 * MIN, was: 'stopped', then: 'stopped' }, at(60));
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

describe('timed sessions', () => {
  const win = windowOf('2026-10-12', 0);

  it('starts a count-down and closes the Flow entry that was running', () => {
    const out = startTimed(startState([], 'should', at(0)), 20 * MIN, at(30));
    expect(shape(out)).toEqual([
      ['should', 0, 30],
      ['timed', 30, null],
    ]);
    expect(runningEntry(out)?.plannedMs).toBe(20 * MIN);
  });

  it('refuses a length that is not positive', () => {
    const before = startState([], 'should', at(0));
    expect(startTimed(before, 0, at(5))).toBe(before);
    expect(startTimed(before, Number.NaN, at(5))).toBe(before);
  });

  it('counts toward timedMs, never toward the balance', () => {
    const t = totalsFor([entry('should', 0, 30), timed(30, 20, 50), entry('want', 50, 55)], win, at(120));
    expect(t).toEqual({ shouldMs: 30 * MIN, wantMs: 5 * MIN, timedMs: 20 * MIN });
    expect(balanceOf(t)).toBe(5 * MIN);
  });

  it('counts a running session up to now, and no further than its length', () => {
    expect(totalsFor([timed(0, 20)], win, at(5)).timedMs).toBe(5 * MIN);
    expect(totalsFor([timed(0, 20)], win, at(90)).timedMs).toBe(20 * MIN);
  });

  it('does not count a closed session past its length either', () => {
    // A merge or an old client can leave one stretched.
    expect(totalsFor([timed(0, 20, 45)], win, at(90)).timedMs).toBe(20 * MIN);
  });

  it('stopping early keeps the time spent', () => {
    const out = stopTimer(startTimed([], 20 * MIN, at(0)), at(7));
    expect(shape(out)).toEqual([['timed', 0, 7]]);
    expect(runningEntry(out)).toBeUndefined();
  });

  it('stopping after the time is up closes it at its end, not at the stop', () => {
    const out = stopTimer(startTimed([], 20 * MIN, at(0)), at(50));
    expect(shape(out)).toEqual([['timed', 0, 20]]);
  });

  it('starting Flow after the time is up closes it at its end', () => {
    const out = startState(startTimed([], 20 * MIN, at(0)), 'should', at(50));
    expect(shape(out)).toEqual([
      ['timed', 0, 20],
      ['should', 50, null],
    ]);
  });

  describe('settleTimed', () => {
    const running = () => startTimed([], 20 * MIN, at(0));

    it('does nothing while time is left', () => {
      const before = running();
      expect(settleTimed(before, at(19))).toBe(before);
    });

    it('closes at exactly start plus length, however late it runs', () => {
      const out = settleTimed(running(), at(500));
      expect(shape(out)).toEqual([['timed', 0, 20]]);
      expect(out.find((e) => e.state === 'timed')?.updatedAt).toBe(at(500));
    });

    it('closes the moment time is up', () => {
      expect(shape(settleTimed(running(), at(20)))).toEqual([['timed', 0, 20]]);
    });

    it('leaves a running Flow entry alone', () => {
      const before = startState([], 'should', at(0));
      expect(settleTimed(before, at(500))).toBe(before);
    });
  });

  describe('activeEntry', () => {
    const running = () => startTimed([], 20 * MIN, at(0));

    it('is the running entry while time is left', () => {
      expect(activeEntry(running(), at(10))?.state).toBe('timed');
    });

    it('is nothing once a Timed entry is past its end, settled or not', () => {
      expect(activeEntry(running(), at(20))).toBeUndefined();
      expect(activeEntry(running(), at(90))).toBeUndefined();
    });

    it('is a Flow entry however long it has run', () => {
      expect(activeEntry(startState([], 'want', at(0)), at(900))?.state).toBe('want');
    });
  });

  it('keeps back-to-back sessions separate', () => {
    const out = startTimed([timed(0, 20, 20)], 20 * MIN, at(20));
    expect(shape(out)).toEqual([
      ['timed', 0, 20],
      ['timed', 20, null],
    ]);
  });

  it('a correction that splits a session keeps its length on both parts', () => {
    const out = paint([timed(0, 60, 60)], at(20), at(30), 'want', at(90));
    expect(out.filter((e) => e.deletedAt === undefined && e.state === 'timed').map((e) => e.plannedMs)).toEqual([
      60 * MIN,
      60 * MIN,
    ]);
  });
});

describe('balanceWindow', () => {
  const day = windowOf('2026-10-13', 0);
  const before = (min: number) => day.start - min * MIN;
  const flow = (state: 'should' | 'want', from: number, to: number | null): TimeEntry => ({
    id: `b${++n}`,
    state,
    startedAt: from,
    endedAt: to,
    updatedAt: 0,
  });
  const now = day.start + 30 * MIN;

  it('is the day window when the running entry began inside it', () => {
    expect(balanceWindow([flow('should', day.start + 5 * MIN, null)], day, now)).toBe(day);
  });

  it('is the day window with nothing running', () => {
    expect(balanceWindow([flow('should', before(60), day.start + 10 * MIN)], day, now)).toBe(day);
    expect(balanceWindow([], day, now)).toBe(day);
  });

  it('carries when the running entry began before the day', () => {
    const win = balanceWindow([flow('should', before(60), null)], day, now);
    expect(win).toEqual({ start: before(60), end: day.end });
  });

  it('carries back through Focus and Rest that touch', () => {
    const entries = [
      flow('should', before(120), before(80)),
      flow('want', before(80), before(20)),
      flow('should', before(20), null),
    ];
    expect(balanceWindow(entries, day, now).start).toBe(before(120));
  });

  it('carries even when the switch happened after the day began', () => {
    const entries = [flow('should', before(60), day.start + 10 * MIN), flow('want', day.start + 10 * MIN, null)];
    expect(balanceWindow(entries, day, now).start).toBe(before(60));
  });

  it('keeps the Rest that Focus earned before the day end', () => {
    const entries = [flow('should', before(90), before(30)), flow('want', before(30), null)];
    const win = balanceWindow(entries, day, now);
    // An hour of Focus earned 20 minutes of Rest; an hour of Rest since leaves 40 in debt.
    expect(balanceOf(totalsFor(entries, win, now))).toBe(-40 * MIN);
    // Counted over the day alone only the last 30 minutes of Rest show, and nothing earned.
    expect(balanceOf(totalsFor(entries, day, now))).toBe(-30 * MIN);
  });

  it('ends at a Stop: the stretch starts again after the gap', () => {
    const entries = [flow('should', before(120), before(100)), flow('want', before(40), null)];
    expect(balanceWindow(entries, day, now).start).toBe(before(40));
  });

  it('after a Stop the carry is over: it is the day window', () => {
    const entries = [flow('should', before(60), day.start + 10 * MIN)];
    expect(balanceWindow(entries, day, now)).toBe(day);
  });

  it('is not carried by a Timed session in between', () => {
    const between = { ...flow('want', before(60), before(30)), state: 'timed' as const, plannedMs: 30 * MIN };
    const entries = [flow('should', before(120), before(60)), between, flow('should', before(30), null)];
    expect(balanceWindow(entries, day, now).start).toBe(before(30));
  });

  it('does not apply to a running Timed session', () => {
    const running = { ...flow('want', before(10), null), state: 'timed' as const, plannedMs: 60 * MIN };
    expect(balanceWindow([flow('should', before(60), before(10)), running], day, now)).toBe(day);
  });

  it('ignores tombstoned entries', () => {
    const dead = { ...flow('should', before(120), before(60)), deletedAt: 1 };
    expect(balanceWindow([dead, flow('want', before(60), null)], day, now).start).toBe(before(60));
  });

  it('is the day window when the stretch began exactly at its start', () => {
    expect(balanceWindow([flow('should', day.start, null)], day, now)).toBe(day);
  });
});
