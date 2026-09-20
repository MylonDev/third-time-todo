import type { EffortTarget, GoalPeriod, Recurrence } from '../types';
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

// ── Recurrence: when is a rule due? ───────────────────────────────────────────

/**
 * Whether `rule` comes due on `date`, given the timestamp it's anchored to.
 * `everyN` counts whole days from the anchor. Never due before the anchor's
 * own day, so a rule that hasn't started yet can't appear due retroactively.
 */
export function isDueOn(rule: Recurrence, anchorCreatedAt: number, date: Date): boolean {
  const start = new Date(anchorCreatedAt);
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return false;

  switch (rule.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return true; // "due this week" — the caller checks completion
    case 'weekdays':
      return rule.days.includes(weekdayIndex(date));
    case 'everyN':
      return days % Math.max(2, rule.n) === 0;
  }
}
