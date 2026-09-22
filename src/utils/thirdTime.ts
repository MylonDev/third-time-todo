import type { Mode } from '../types';

/**
 * The label names the mode you are in; the ratio is the mechanic. Naming them
 * by difficulty made the rest-generous end read as "Easy", which is a nudge
 * against resting in an app whose whole point is that rest is earned.
 *
 * The `Mode` keys stay 'quarter' | 'third' | 'half' so persisted settings and
 * every archived SessionLog.mode keep working — only what you read changes.
 */
export const MODE_CONFIG: Record<Mode, { label: string; ratio: number; description: string; color: string }> = {
  quarter: {
    label: 'Locked in',
    ratio: 4,
    description: 'Lean rest — 1 min back for every 4 min active',
    color: 'orange',
  },
  third: {
    label: 'Serious',
    ratio: 3,
    description: 'Balanced — 1 min back for every 3 min active',
    color: 'purple',
  },
  half: {
    label: 'Relaxed',
    ratio: 2,
    description: 'Generous rest — 1 min back for every 2 min active',
    color: 'teal',
  },
};

/** How much break time (ms) is earned for a given work duration */
export function earnBreak(workMs: number, mode: Mode): number {
  return workMs / MODE_CONFIG[mode].ratio;
}

/** Apply completed work to the bank (reduces debt or grows credit) */
export function applyWork(bankMs: number, workMs: number, mode: Mode): number {
  return bankMs + earnBreak(workMs, mode);
}

/** Deduct break time from the bank (can push into negative / debt) */
export function spendBreak(bankMs: number, breakMs: number): number {
  return bankMs - breakMs;
}

export function isInDebt(bankMs: number): boolean {
  return bankMs < 0;
}

/** Format milliseconds as M:SS */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Format milliseconds as H:MM:SS when hours > 0, else M:SS */
export function formatTimeLong(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Human duration for goals and targets — "1h 36m", "45m". Distinct from
 * formatTimeLong, which is a running stopwatch and needs seconds.
 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(Math.abs(ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// ── Date keys ─────────────────────────────────────────────────────────────────
//
// `dateKey` and `weekdayIndex` live here rather than in `goalPeriod.ts` (which
// re-exports them) because `dayKeyOf` below needs `dateKey`, and
// `goalPeriod.ts` imports `todayKey` from this module — putting both ends of
// that dependency in the same file avoids the cycle.

/** YYYY-MM-DD for a Date, in local time. */
export function dateKey(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Monday=0 … Sunday=6 for a Date (JS `getDay` has Sunday=0). */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

const HOUR_MS = 3_600_000;

/**
 * The day a moment belongs to. A day ends at `dayEndHour` local time, not
 * necessarily midnight — someone who works until 1 AM is still having last
 * night, and their bank, timeline and task list should agree.
 */
export function dayKeyOf(t: number, dayEndHour: number): string {
  return dateKey(new Date(t - dayEndHour * HOUR_MS));
}

export function todayKey(dayEndHour: number): string {
  return dayKeyOf(Date.now(), dayEndHour);
}

/**
 * The day key `n` days after `key` (before, for negative `n`). Calendar
 * arithmetic, not `± n × 24h`: across a DST change a day is 23 or 25 hours
 * long, and a fixed step lands on the wrong side of it.
 */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

export function tomorrowKey(dayEndHour: number): string {
  return shiftDayKey(todayKey(dayEndHour), 1);
}

/** The instant the day named by `key` begins. */
export function dayStartOf(key: string, dayEndHour: number): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, dayEndHour, 0, 0, 0).getTime();
}

/**
 * The instant it ends — the same as the next day's start. Built the same way
 * `dayStartOf` is (calendar arithmetic, not a fixed millisecond step) so it
 * still lands on the next day's boundary across a DST transition, where the
 * local day is 23 or 25 hours long.
 */
export function dayEndOf(key: string, dayEndHour: number): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d + 1, dayEndHour, 0, 0, 0).getTime();
}

export const MODE_BADGE_CLASSES: Record<Mode, string> = {
  quarter: 'bg-[var(--color-mode-quarter-dim)] text-[var(--color-mode-quarter)]',
  third:   'bg-[var(--color-mode-third-dim)]   text-[var(--color-mode-third)]',
  half:    'bg-[var(--color-mode-half-dim)]     text-[var(--color-mode-half)]',
};

/** Returns true if a task created at createdAt is considered stale (> 2 days old) */
export function isStale(createdAt: number): boolean {
  return Date.now() - createdAt > 2 * 24 * 60 * 60 * 1000;
}

/** Returns number of full days since createdAt */
export function daysSince(createdAt: number): number {
  return Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));
}
