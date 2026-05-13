import type { Goal, GoalPeriod } from '../types';
import { todayKey, daysSince, formatTimeLong } from './thirdTime';

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

export function getPeriodKey(period: GoalPeriod, periodDays: number | undefined, createdAt: number): string {
  if (period === 'daily') return todayKey();
  if (period === 'weekly') return getWeekKey(new Date());
  const days = Math.floor(daysSince(createdAt));
  const windowIndex = Math.floor(days / (periodDays ?? 1));
  return `custom-${windowIndex}`;
}

export function getCurrentPeriodKey(goal: Goal): string {
  return getPeriodKey(goal.period, goal.periodDays, goal.createdAt);
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
  return `${formatTimeLong(value)} / ${formatTimeLong(goal.target)}`;
}

export function formatGoalTarget(goal: Goal): string {
  if (goal.type === 'boolean') return 'Done / Not done';
  if (goal.type === 'counter') return `${goal.target}×`;
  return formatTimeLong(goal.target);
}
