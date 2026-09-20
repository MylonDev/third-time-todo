import type { Recurrence } from '../types';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Human-readable cadence, e.g. "Daily", "Every 3 days", "Mon · Wed · Fri". */
export function recurrenceLabel(freq: Recurrence): string {
  switch (freq.kind) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'everyN':
      return `Every ${freq.n} days`;
    case 'weekdays':
      if (freq.days.length === 0) return 'No days set';
      if (freq.days.length === 7) return 'Daily';
      return [...freq.days]
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_LABELS[d])
        .join(' · ');
  }
}
