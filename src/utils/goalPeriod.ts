import type { Goal, GoalPeriod } from '../types';
import { todayKey, daysSince, formatDuration } from './thirdTime';

export function getWeekKey(date: Date): string {
  const d = new Date(date);
  // Monday = 0 in ISO; JS getDay() has Sunday = 0
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The `count` most recent period keys for a cadence, oldest first — the x axis
 * for anything that charts a routine or goal over time.
 */
export function pastPeriodKeys(
  period: GoalPeriod,
  periodDays: number | undefined,
  anchor: number,
  count: number
): string[] {
  if (period === 'custom') {
    const days = Math.floor(daysSince(anchor));
    const current = Math.floor(days / (periodDays ?? 1));
    return Array.from({ length: count }, (_, i) => `custom-${current - (count - 1 - i)}`)
      .filter((key) => Number(key.slice(7)) >= 0);
  }
  const step = period === 'weekly' ? 7 : 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i) * step);
    return period === 'weekly' ? getWeekKey(d) : [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  });
}

export function getPeriodKey(period: GoalPeriod, periodDays: number | undefined, createdAt: number): string {
  if (period === 'daily') return todayKey();
  if (period === 'weekly') return getWeekKey(new Date());
  const days = Math.floor(daysSince(createdAt));
  const windowIndex = Math.floor(days / (periodDays ?? 1));
  return `custom-${windowIndex}`;
}

export function getCurrentPeriodKey(goal: Goal): string {
  return getPeriodKey(goal.period, goal.periodDays, goal.periodAnchor ?? goal.createdAt);
}

/**
 * Progress is keyed by period and never expires on its own, so a daily goal
 * would add a key a day to localStorage forever. Keep a couple of years.
 */
const MAX_PERIODS = 90;

export function prunePeriods(progress: Record<string, number>): Record<string, number> {
  const keys = Object.keys(progress);
  if (keys.length <= MAX_PERIODS) return progress;
  const ordered = keys.sort((a, b) => {
    const na = a.startsWith('custom-') ? Number(a.slice(7)) : NaN;
    const nb = b.startsWith('custom-') ? Number(b.slice(7)) : NaN;
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return Object.fromEntries(
    ordered.slice(-MAX_PERIODS).map((k) => [k, progress[k]])
  );
}

export function getPeriodLabel(goal: Goal): string {
  if (goal.period === 'daily') return 'Daily';
  if (goal.period === 'weekly') return 'Weekly';
  return `Every ${goal.periodDays ?? 1}d`;
}

export function getProgressForPeriod(goal: Goal, periodKey: string): number {
  return goal.progress[periodKey] ?? 0;
}

export function isGoalComplete(goal: Goal): boolean {
  return getProgressForPeriod(goal, getCurrentPeriodKey(goal)) >= goal.target;
}

export function formatGoalProgress(goal: Goal, value: number): string {
  if (goal.type === 'boolean') return value >= 1 ? 'Done' : 'Not done';
  if (goal.type === 'counter') return `${value} / ${goal.target}`;
  // time — value and target are ms
  return `${formatDuration(value)} / ${formatDuration(goal.target)}`;
}

export function formatGoalTarget(goal: Goal): string {
  if (goal.type === 'boolean') return 'Done / Not done';
  if (goal.type === 'counter') return `${goal.target}×`;
  return formatDuration(goal.target);
}
