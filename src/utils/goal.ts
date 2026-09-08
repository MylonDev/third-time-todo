import type { Goal } from '../types';
import { formatDuration } from './thirdTime';

/** Everything logged against a goal, across every period. */
export function cumulativeTotal(goal: Goal): number {
  return Object.values(goal.progress).reduce((a, b) => a + b, 0);
}

/**
 * The goal's outcome target in the same unit its progress is logged in
 * (milliseconds for a time goal, the count unit for a count goal), or `null`
 * for an open goal.
 */
export function outcomeTarget(goal: Goal): number | null {
  if (goal.outcome.kind === 'count') return goal.outcome.target;
  if (goal.outcome.kind === 'time') return goal.outcome.targetHours * 3_600_000;
  return null;
}

/** Fraction of the outcome reached (0–1+), or `null` when there is no number. */
export function outcomeProgress(goal: Goal): number | null {
  const target = outcomeTarget(goal);
  if (!target) return null;
  return cumulativeTotal(goal) / target;
}

/** Whether the goal has met its definition of done. */
export function isGoalMet(goal: Goal): boolean {
  if (goal.milestones.length > 0 && goal.milestones.every((m) => m.doneAt)) return true;
  const p = outcomeProgress(goal);
  return p != null && p >= 1;
}

/** A human total for the goal's cumulative progress. */
export function formatGoalTotal(goal: Goal): string {
  const total = cumulativeTotal(goal);
  if (goal.outcome.kind === 'time') return formatDuration(total);
  if (goal.outcome.kind === 'count') return `${Math.round(total)} ${goal.outcome.unit}`;
  return `${Math.round(total)}`;
}
