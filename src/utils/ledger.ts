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

/** Entries are a partition of the day: they may touch, never overlap. */
export function entriesOverlap(
  a: { startedAt: number; endedAt: number },
  b: { startedAt: number; endedAt: number }
): boolean {
  return a.startedAt < b.endedAt && b.startedAt < a.endedAt;
}
