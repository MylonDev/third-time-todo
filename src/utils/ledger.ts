import type { EntryState, TimeEntry, TimerState } from '../types';
import type { DayWindow } from './time';

/** Every 3 seconds of Focus earns 1 second of Rest. */
export const RATIO = 3;

/** The longest stretch "Fix timer" will rewrite. */
export const MAX_FIX_MS = 12 * 3_600_000;

export type Painted = TimerState | 'stopped';

const isLive = (e: TimeEntry) => e.deletedAt === undefined;

export function runningEntry(entries: TimeEntry[]): TimeEntry | undefined {
  return entries.find((e) => isLive(e) && e.endedAt === null);
}

/** The moment a Timed entry runs out. */
export function timedEnd(e: TimeEntry): number {
  return e.startedAt + (e.plannedMs ?? 0);
}

/**
 * The moment an entry stops counting. A Timed entry never counts past its
 * planned length, even if it was left open or a merge stretched it.
 */
function endOf(e: TimeEntry, now: number): number {
  const end = e.endedAt ?? now;
  return e.state === 'timed' ? Math.min(end, timedEnd(e)) : end;
}

/**
 * What is running right now. A Timed entry past its end is not: it only awaits
 * `settleTimed` to close it, and the screen shouldn't wait for that.
 */
export function activeEntry(entries: TimeEntry[], now: number): TimeEntry | undefined {
  const running = runningEntry(entries);
  return running?.state === 'timed' && now >= timedEnd(running) ? undefined : running;
}

// ── Reading ───────────────────────────────────────────────────────────────────

export interface Totals {
  shouldMs: number;
  wantMs: number;
  /** Timed sessions. History only: the balance ignores it. */
  timedMs: number;
}

/**
 * A day's time in each state. Entries are clipped to the day's window rather
 * than split, so a stint that crosses the boundary counts toward both days and
 * the running timer never has to be restarted.
 */
export function totalsFor(entries: TimeEntry[], win: DayWindow, now: number): Totals {
  const totals: Totals = { shouldMs: 0, wantMs: 0, timedMs: 0 };
  for (const e of entries) {
    if (!isLive(e)) continue;
    const start = Math.max(e.startedAt, win.start);
    const end = Math.min(endOf(e, now), win.end);
    if (end <= start) continue;
    if (e.state === 'should') totals.shouldMs += end - start;
    else if (e.state === 'want') totals.wantMs += end - start;
    else totals.timedMs += end - start;
  }
  return totals;
}

/** Rest available (positive) or owed (negative). Derived, never stored. */
export function balanceOf(t: Totals): number {
  return t.shouldMs / RATIO - t.wantMs;
}

/**
 * The window the Flow balance is counted over. Normally that is the day's. But
 * if the timer has run in Focus and Rest back to back since before the day
 * began, the balance carries on: the window starts where that stretch started.
 * Any Stop or Timed session in between ends the stretch, so the carry ends at
 * the first Stop after the day end. Day totals and history still use the day's
 * own window. Returns `win` itself when nothing carries.
 */
export function balanceWindow(entries: TimeEntry[], win: DayWindow, now: number): DayWindow {
  const current = activeEntry(entries, now);
  if (!current || current.state === 'timed') return win;

  const live = entries.filter(isLive).sort((a, b) => a.startedAt - b.startedAt);
  let start = current.startedAt;
  for (let i = live.indexOf(current) - 1; i >= 0; i--) {
    const before = live[i];
    // A gap is a Stop, and a Timed session is not part of the Flow.
    if (before.state === 'timed' || before.endedAt === null || before.endedAt < start) break;
    start = before.startedAt;
  }
  return start < win.start ? { start, end: win.end } : win;
}

// ── Writing ───────────────────────────────────────────────────────────────────
//
// Every function here is pure: it takes the entries and returns new ones. A
// removed entry is tombstoned, not dropped, so the removal can sync.

function make(
  state: EntryState,
  startedAt: number,
  endedAt: number | null,
  now: number,
  plannedMs?: number,
  practiceId?: string
): TimeEntry {
  return {
    id: crypto.randomUUID(),
    state,
    startedAt,
    endedAt,
    ...(plannedMs !== undefined && { plannedMs }),
    ...(practiceId !== undefined && { practiceId }),
    updatedAt: now,
  };
}

function tombstone(e: TimeEntry, now: number): TimeEntry {
  return { ...e, deletedAt: now, updatedAt: now };
}

/**
 * Close the running entry at `at`, or at its own end if a Timed one ran out
 * first. An entry that would be empty is removed.
 */
function closeRunning(entries: TimeEntry[], at: number): TimeEntry[] {
  const running = runningEntry(entries);
  if (!running) return entries;
  const to = endOf(running, at);
  return entries.map((e) => {
    if (e !== running) return e;
    return to > e.startedAt ? { ...e, endedAt: to, updatedAt: at } : tombstone(e, at);
  });
}

/**
 * Start `state`, closing whatever was running. Starting the running state is a
 * no-op. Switching between Focus and Rest keeps the practice the Flow was for;
 * `practiceId` names one when starting from stopped.
 */
export function startState(
  entries: TimeEntry[],
  state: TimerState,
  at: number,
  practiceId?: string
): TimeEntry[] {
  const running = runningEntry(entries);
  if (running?.state === state) return entries;
  const practice = practiceId ?? (running?.state === 'timed' ? undefined : running?.practiceId);
  return normalize([...closeRunning(entries, at), make(state, at, null, at, undefined, practice)], at);
}

/** Start a Timed session of `plannedMs`, closing whatever was running. */
export function startTimed(
  entries: TimeEntry[],
  plannedMs: number,
  at: number,
  practiceId?: string
): TimeEntry[] {
  if (!(plannedMs > 0)) return entries;
  return normalize([...closeRunning(entries, at), make('timed', at, null, at, plannedMs, practiceId)], at);
}

export function stopTimer(entries: TimeEntry[], at: number): TimeEntry[] {
  return closeRunning(entries, at);
}

/**
 * Close a running Timed entry whose time is up, at exactly `startedAt +
 * plannedMs`. That is the moment it ended even if the app was closed then, so
 * reopening it later records the right end. Returns `entries` itself when
 * there is nothing to settle.
 */
export function settleTimed(entries: TimeEntry[], now: number): TimeEntry[] {
  const running = runningEntry(entries);
  if (running?.state !== 'timed' || now < timedEnd(running)) return entries;
  return closeRunning(entries, now);
}

/**
 * Overwrite [from, to) with a state, or with stopped. Entries inside the range are
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
      out.push(make(e.state, to, e.endedAt, now, e.plannedMs, e.practiceId));
    }
  }
  if (state !== 'stopped') out.push(make(state, from, to, now));
  return normalize(out, now);
}

/**
 * Tidy the ledger: sort, and merge entries of the same state and practice that
 * touch. The earlier entry survives and absorbs the later one, which is tombstoned.
 */
function normalize(entries: TimeEntry[], now: number): TimeEntry[] {
  const live = entries.filter(isLive).sort((a, b) => a.startedAt - b.startedAt);
  const dead = entries.filter((e) => !isLive(e));
  const merged: TimeEntry[] = [];
  for (const e of live) {
    const last = merged[merged.length - 1];
    // Timed sessions stay separate: two back to back are two sessions.
    if (
      last &&
      last.endedAt !== null &&
      last.endedAt === e.startedAt &&
      last.state === e.state &&
      last.practiceId === e.practiceId &&
      e.state !== 'timed'
    ) {
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
  /** What is happening now. `stopped` stops the timer. */
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
 * Closes the timer, paints the last X minutes, and reopens in `then`. The
 * reopened entry is for the practice the running one was; the painted range is not.
 */
export function applyFix(entries: TimeEntry[], fix: Fix, now: number): TimeEntry[] {
  const running = runningEntry(entries);
  const practice = running?.state === 'timed' ? undefined : running?.practiceId;
  const frozen = closeRunning(entries, now);
  const painted = paint(frozen, now - fix.ms, now, fix.was, now);
  if (fix.then === 'stopped') return painted;
  return normalize([...painted, make(fix.then, now, null, now, undefined, practice)], now);
}
