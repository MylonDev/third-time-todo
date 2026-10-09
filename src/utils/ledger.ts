import type { TimeEntry, TimerState } from '../types';
import type { DayWindow } from './time';

/** Every 3 seconds in Should earns 1 second of Want. */
export const RATIO = 3;

/** The longest stretch "Fix timer" will rewrite. */
export const MAX_FIX_MS = 12 * 3_600_000;

export type Painted = TimerState | 'rest';

const isLive = (e: TimeEntry) => e.deletedAt === undefined;

export function runningEntry(entries: TimeEntry[]): TimeEntry | undefined {
  return entries.find((e) => isLive(e) && e.endedAt === null);
}

// ── Reading ───────────────────────────────────────────────────────────────────

export interface Totals {
  shouldMs: number;
  wantMs: number;
}

/**
 * A day's time in each state. Entries are clipped to the day's window rather
 * than split, so a stint that crosses the boundary counts toward both days and
 * the running timer never has to be restarted.
 */
export function totalsFor(entries: TimeEntry[], win: DayWindow, now: number): Totals {
  const totals: Totals = { shouldMs: 0, wantMs: 0 };
  for (const e of entries) {
    if (!isLive(e)) continue;
    const start = Math.max(e.startedAt, win.start);
    const end = Math.min(e.endedAt ?? now, win.end);
    if (end <= start) continue;
    if (e.state === 'should') totals.shouldMs += end - start;
    else totals.wantMs += end - start;
  }
  return totals;
}

/** Want time available (positive) or owed (negative). Derived, never stored. */
export function balanceOf(t: Totals): number {
  return t.shouldMs / RATIO - t.wantMs;
}

// ── Writing ───────────────────────────────────────────────────────────────────
//
// Every function here is pure: it takes the entries and returns new ones. A
// removed entry is tombstoned, not dropped, so the removal can sync.

function make(state: TimerState, startedAt: number, endedAt: number | null, now: number): TimeEntry {
  return { id: crypto.randomUUID(), state, startedAt, endedAt, updatedAt: now };
}

function tombstone(e: TimeEntry, now: number): TimeEntry {
  return { ...e, deletedAt: now, updatedAt: now };
}

/** Close the running entry at `at`. An entry that would be empty is removed. */
function closeRunning(entries: TimeEntry[], at: number): TimeEntry[] {
  const running = runningEntry(entries);
  if (!running) return entries;
  return entries.map((e) => {
    if (e !== running) return e;
    return at > e.startedAt ? { ...e, endedAt: at, updatedAt: at } : tombstone(e, at);
  });
}

/** Start `state`, closing whatever was running. Starting the running state is a no-op. */
export function startState(entries: TimeEntry[], state: TimerState, at: number): TimeEntry[] {
  if (runningEntry(entries)?.state === state) return entries;
  return normalize([...closeRunning(entries, at), make(state, at, null, at)], at);
}

export function stopTimer(entries: TimeEntry[], at: number): TimeEntry[] {
  return closeRunning(entries, at);
}

/**
 * Overwrite [from, to) with a state, or with rest. Entries inside the range are
 * removed, entries that straddle an edge are trimmed, and one that spans the
 * whole range is split around it. This one operation is every correction.
 */
export function paint(
  entries: TimeEntry[],
  from: number,
  to: number,
  state: Painted,
  now: number
): TimeEntry[] {
  if (to <= from) return entries;
  const out: TimeEntry[] = [];
  for (const e of entries) {
    if (!isLive(e)) {
      out.push(e);
      continue;
    }
    const end = e.endedAt ?? Infinity;
    if (end <= from || e.startedAt >= to) {
      out.push(e);
    } else if (e.startedAt >= from && end <= to) {
      out.push(tombstone(e, now));
    } else if (e.startedAt < from && end <= to) {
      out.push({ ...e, endedAt: from, updatedAt: now });
    } else if (e.startedAt >= from && end > to) {
      out.push({ ...e, startedAt: to, updatedAt: now });
    } else {
      // Spans the range: keep the left part, and give the right part a new id.
      out.push({ ...e, endedAt: from, updatedAt: now });
      out.push(make(e.state, to, e.endedAt, now));
    }
  }
  if (state !== 'rest') out.push(make(state, from, to, now));
  return normalize(out, now);
}

/**
 * Tidy the ledger: sort, and merge entries of the same state that touch. The
 * earlier entry survives and absorbs the later one, which is tombstoned.
 */
export function normalize(entries: TimeEntry[], now: number): TimeEntry[] {
  const live = entries.filter(isLive).sort((a, b) => a.startedAt - b.startedAt);
  const dead = entries.filter((e) => !isLive(e));
  const merged: TimeEntry[] = [];
  for (const e of live) {
    const last = merged[merged.length - 1];
    if (last && last.endedAt !== null && last.endedAt === e.startedAt && last.state === e.state) {
      merged[merged.length - 1] = { ...last, endedAt: e.endedAt, updatedAt: now };
      dead.push(tombstone(e, now));
    } else {
      merged.push(e);
    }
  }
  return [...dead, ...merged];
}

export interface Fix {
  /** How far back the correction reaches. */
  ms: number;
  /** What the time since then actually was. */
  was: Painted;
  /** What is happening now. `rest` stops the timer. */
  then: Painted;
}

/** Why a fix can't be applied, or null. */
export function fixRefusal(fix: Pick<Fix, 'ms'>): string | null {
  if (!(fix.ms > 0)) return 'Enter how long ago it should have changed.';
  if (fix.ms > MAX_FIX_MS) return 'That reaches back more than 12 hours.';
  return null;
}

/**
 * "The last X minutes were actually Was, and since then I've been Then."
 * Closes the timer, paints the last X minutes, and reopens in `then`.
 */
export function applyFix(entries: TimeEntry[], fix: Fix, now: number): TimeEntry[] {
  const frozen = closeRunning(entries, now);
  const painted = paint(frozen, now - fix.ms, now, fix.was, now);
  if (fix.then === 'rest') return painted;
  return normalize([...painted, make(fix.then, now, null, now)], now);
}
