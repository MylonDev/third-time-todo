import type { Recurrence } from '../types';
import { shiftDayKey, weekdayOfKey } from './time';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Human-readable cadence, e.g. "Daily", "Every 3 days", "Mon · Wed · Fri". */
export function recurrenceLabel(rule: Recurrence): string {
  switch (rule.kind) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'everyN':
      return `Every ${rule.n} days`;
    case 'weekdays':
      if (rule.days.length === 0) return 'No days set';
      if (rule.days.length === 7) return 'Daily';
      return [...rule.days]
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_LABELS[d])
        .join(' · ');
  }
}

function firstMatchAfter(from: string, matches: (key: string) => boolean): string {
  for (let i = 1; i <= 7; i++) {
    const key = shiftDayKey(from, i);
    if (matches(key)) return key;
  }
  return shiftDayKey(from, 1);
}

/**
 * When a repeating item comes back after being completed. The count starts from
 * the later of its due date and today, so finishing a long-overdue item leaves
 * one new occurrence rather than a backlog.
 */
export function nextDueKey(rule: Recurrence, dueOn: string, today: string): string {
  const from = dueOn > today ? dueOn : today;
  switch (rule.kind) {
    case 'daily':
      return shiftDayKey(from, 1);
    case 'everyN':
      return shiftDayKey(from, Math.max(1, Math.floor(rule.n)));
    case 'weekly': {
      const weekday = weekdayOfKey(dueOn);
      return firstMatchAfter(from, (k) => weekdayOfKey(k) === weekday);
    }
    case 'weekdays': {
      if (rule.days.length === 0) return shiftDayKey(from, 1);
      return firstMatchAfter(from, (k) => rule.days.includes(weekdayOfKey(k)));
    }
  }
}
