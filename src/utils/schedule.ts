import type { RecurringTask, Task } from '../types';
import { isDueOn, getWeekKey } from './goalPeriod';
import { dayKeyOf, shiftDayKey, weekdayIndex } from './thirdTime';

export type ScheduleView = 'week' | 'rolling';

/** The seven day keys a view draws: Monday–Sunday of this week, or today onward. */
export function scheduleDays(view: ScheduleView, today: string, dayEndHour: number): string[] {
  const first =
    view === 'week' ? getWeekKey(new Date(today + 'T12:00:00'), dayEndHour) : today;
  return Array.from({ length: 7 }, (_, i) => shiftDayKey(first, i));
}

function keyDate(key: string): Date {
  return new Date(key + 'T00:00:00');
}

/**
 * Whether a recurring task has an occurrence on `day`. `weekly` means "on the
 * anchor's weekday" — the old habits sense ("some time this week") has no
 * column to sit in on a day-by-day board.
 */
export function occursOn(rt: RecurringTask, day: string, dayEndHour: number): boolean {
  if (rt.skipped?.[day]) return false;
  if (rt.endedAt !== undefined && day > dayKeyOf(rt.endedAt, dayEndHour)) return false;
  const date = keyDate(day);
  if (rt.rule.kind === 'weekly') {
    const anchor = keyDate(dayKeyOf(rt.createdAt, dayEndHour));
    return date >= anchor && weekdayIndex(date) === weekdayIndex(anchor);
  }
  return isDueOn(rt.rule, keyDate(dayKeyOf(rt.createdAt, dayEndHour)).getTime(), date);
}

/**
 * One-off tasks left undone on a day that has passed. They stay in their own
 * column as history; this is the list today's Overdue strip offers to pull
 * forward. A missed recurring occurrence is never overdue — the next one
 * stands on its own.
 */
export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => !t.routineId && t.status !== 'done' && t.scheduledDate < today)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.order - b.order);
}

/** Keep the most recent `max` date keys of a completion/skip map. */
export function pruneDateKeys(map: Record<string, true>, max = 800): Record<string, true> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  return Object.fromEntries(keys.sort().slice(-max).map((k) => [k, true as const]));
}
