import type { EffortTarget, GoalPeriod, Habit } from '../types';
import { todayKey, daysSince, dateKey, weekdayIndex, dayKeyOf } from './thirdTime';

// `dateKey` and `weekdayIndex` actually live in `thirdTime.ts` now — it needs
// `dateKey` for `dayKeyOf` and already had to import from here, so keeping
// both ends of that dependency in one file avoids an import cycle. Re-export
// them so everything that already imports them from `goalPeriod` keeps working.
export { dateKey, weekdayIndex };

// ── Date keys ─────────────────────────────────────────────────────────────────

/**
 * The Monday of a date's ISO week, as a date key. Goes through `dayKeyOf`
 * rather than the raw date so the week boundary moves with the day boundary —
 * a Monday session that runs past midnight but before `dayEndHour` is still
 * Sunday's week.
 */
export function getWeekKey(date: Date, dayEndHour: number): string {
  const key = dayKeyOf(date.getTime(), dayEndHour);
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() - weekdayIndex(d));
  return dateKey(d);
}

/** The last `n` calendar day keys ending today (or `end`), oldest first. */
export function lastNDays(n: number, end: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (n - 1 - i));
    return dateKey(d);
  });
}

// ── Period keys (goals' effort targets) ───────────────────────────────────────

export function getPeriodKey(
  period: GoalPeriod,
  periodDays: number | undefined,
  anchor: number,
  dayEndHour: number
): string {
  if (period === 'daily') return todayKey(dayEndHour);
  if (period === 'weekly') return getWeekKey(new Date(), dayEndHour);
  const windows = Math.floor(daysSince(anchor) / (periodDays ?? 1));
  return `custom-${windows}`;
}

/** The current period key for an effort target, counting custom windows from `anchor`. */
export function effortPeriodKey(effort: EffortTarget, anchor: number, dayEndHour: number): string {
  return getPeriodKey(effort.period, effort.periodDays, anchor, dayEndHour);
}

/**
 * The `count` most recent period keys for a cadence, oldest first — an x axis
 * for anything that charts a goal's per-period progress over time.
 */
export function pastPeriodKeys(
  period: GoalPeriod,
  periodDays: number | undefined,
  anchor: number,
  count: number,
  dayEndHour: number
): string[] {
  if (period === 'custom') {
    const current = Math.floor(daysSince(anchor) / (periodDays ?? 1));
    return Array.from({ length: count }, (_, i) => `custom-${current - (count - 1 - i)}`)
      .filter((key) => Number(key.slice(7)) >= 0);
  }
  const step = period === 'weekly' ? 7 : 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i) * step);
    return period === 'weekly' ? getWeekKey(d, dayEndHour) : dateKey(d);
  });
}

/**
 * Progress is keyed by period and never expires on its own. Cumulative goal
 * totals are the sum of this map, so pruning understates them — keep enough
 * keys that a daily cadence lasts years before the oldest is dropped.
 */
const MAX_PERIODS = 800;

export function prunePeriods(progress: Record<string, number>): Record<string, number> {
  const keys = Object.keys(progress);
  if (keys.length <= MAX_PERIODS) return progress;
  const ordered = keys.sort((a, b) => {
    const na = a.startsWith('custom-') ? Number(a.slice(7)) : NaN;
    const nb = b.startsWith('custom-') ? Number(b.slice(7)) : NaN;
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return Object.fromEntries(ordered.slice(-MAX_PERIODS).map((k) => [k, progress[k]]));
}

// ── Habits: when is one due? ──────────────────────────────────────────────────

/**
 * Whether a habit comes due on `date`, ignoring whether it has been completed.
 * `everyN` counts whole days from the habit's creation.
 */
export function isHabitDueOn(habit: Habit, date: Date): boolean {
  const f = habit.freq;
  switch (f.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return true; // "due this week" — the list layer checks completion
    case 'weekdays':
      return f.days.includes(weekdayIndex(date));
    case 'everyN': {
      const start = new Date(habit.createdAt);
      start.setHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
      return days >= 0 && days % Math.max(2, f.n) === 0;
    }
  }
}

function midnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Whether a habit still needs doing — due for the current period and not yet
 * completed. `everyN` catches up: a missed occurrence stays outstanding until
 * its next scheduled day comes round, not only on the exact day.
 */
export function isHabitOutstanding(
  habit: Habit,
  dayEndHour: number,
  today: Date = new Date()
): boolean {
  if (habit.archivedAt) return false;
  const f = habit.freq;

  if (f.kind === 'weekly') {
    const weekStart = getWeekKey(today, dayEndHour);
    return !Object.keys(habit.completions).some((k) => k >= weekStart && habit.completions[k]);
  }

  if (f.kind === 'everyN') {
    const n = Math.max(2, f.n);
    const start = midnight(new Date(habit.createdAt));
    const days = Math.round((midnight(today).getTime() - start.getTime()) / 86_400_000);
    if (days < 0) return false;
    const lastDue = new Date(start);
    lastDue.setDate(lastDue.getDate() + (days - (days % n)));
    const lastDueKey = dateKey(lastDue);
    return !Object.keys(habit.completions).some((k) => k >= lastDueKey && habit.completions[k]);
  }

  if (!isHabitDueOn(habit, today)) return false;
  return !habit.completions[dateKey(today)];
}
