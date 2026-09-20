import type { Mode, TimeEntry } from '../types';
import { earnBreak } from './thirdTime';

/** A timer that is still running — not an entry until it stops. */
export interface OpenSegment {
  kind: 'work' | 'break';
  startedAt: number;
  mode: Mode;
  projectId?: string;
  taskId?: string;
}

export function durationOf(e: { startedAt: number; endedAt: number }): number {
  return Math.max(0, e.endedAt - e.startedAt);
}

export function workMsOf(entries: TimeEntry[]): number {
  return entries.filter((e) => e.kind === 'work').reduce((a, e) => a + durationOf(e), 0);
}

export function breakMsOf(entries: TimeEntry[]): number {
  return entries.filter((e) => e.kind === 'break').reduce((a, e) => a + durationOf(e), 0);
}

/**
 * The bank is not stored anywhere — it is this sum over the day's entries, plus
 * whatever the running timer has accrued so far. Deriving it is what makes
 * retroactive edits to the timeline trustworthy: trim a work block and the rest
 * it earned goes with it, with no delta arithmetic to get wrong.
 */
export function bankOf(entries: TimeEntry[], open?: OpenSegment | null, now = Date.now()): number {
  const all: { kind: 'work' | 'break'; startedAt: number; endedAt: number; mode: Mode }[] = [
    ...entries,
    ...(open && now > open.startedAt
      ? [{ kind: open.kind, startedAt: open.startedAt, endedAt: now, mode: open.mode }]
      : []),
  ];
  return all.reduce(
    (bank, e) =>
      e.kind === 'work' ? bank + earnBreak(durationOf(e), e.mode) : bank - durationOf(e),
    0
  );
}

/**
 * A timer left running across the end of the day. With no End Session button,
 * this is the ordinary case for anyone who forgets to stop — so the day is not
 * allowed to stall on it. The entry is closed at the boundary and an identical
 * one opens on the far side; the timeline then shows an honest (if long) block
 * on each day, which the user can trim.
 */
export function splitAtBoundary(
  open: OpenSegment,
  boundary: number,
  now: number
): { closed: TimeEntry; reopened: OpenSegment } {
  // `now` isn't needed to compute the split — both halves are dated off
  // `boundary` — but it's part of the call's contract for callers, so it's
  // named rather than dropped.
  void now;
  return {
    closed: {
      id: crypto.randomUUID(),
      kind: open.kind,
      startedAt: open.startedAt,
      endedAt: boundary,
      projectId: open.projectId,
      taskId: open.taskId,
      mode: open.mode,
    },
    reopened: { ...open, startedAt: boundary },
  };
}

/** Entries are a partition of the day: they may touch, never overlap. */
export function entriesOverlap(
  a: { startedAt: number; endedAt: number },
  b: { startedAt: number; endedAt: number }
): boolean {
  return a.startedAt < b.endedAt && b.startedAt < a.endedAt;
}
