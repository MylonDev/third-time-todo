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

function clock(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Why an entry can't go into a day as drawn, or null if it can. The timeline's
 * rules, in one place so the store enforces exactly what the editor explains:
 *
 * - it ends after it starts;
 * - it stays inside its own day — crossing the boundary means splitting;
 * - it claims nothing past `claimableUntil` (now, or where the running timer
 *   began — that stretch belongs to the open segment);
 * - it overlaps no other entry. An edit that would swallow a neighbour is
 *   refused, never resolved by quietly trimming the neighbour.
 */
export function refusalFor(
  candidate: { startedAt: number; endedAt: number },
  others: TimeEntry[],
  day: { start: number; end: number },
  claimableUntil: number
): string | null {
  if (!(candidate.endedAt > candidate.startedAt)) return 'An entry has to end after it starts.';
  if (candidate.startedAt < day.start || candidate.endedAt > day.end) {
    return 'An entry can’t cross into another day. Split it at the boundary instead.';
  }
  if (candidate.endedAt > claimableUntil) {
    return claimableUntil < Date.now()
      ? 'That runs into the timer that’s going now.'
      : 'That ends in the future.';
  }
  const clash = others.find((o) => entriesOverlap(o, candidate));
  if (clash) {
    const what = clash.kind === 'work' ? 'active' : 'rest';
    return `That overlaps the ${what} block from ${clock(clash.startedAt)} to ${clock(clash.endedAt)}.`;
  }
  return null;
}
