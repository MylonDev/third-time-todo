/** Format milliseconds as M:SS, or H:MM:SS once an hour has passed. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Human duration for totals and targets: "1h 36m", "45m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(Math.abs(ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// ── Day keys ──────────────────────────────────────────────────────────────────

/** YYYY-MM-DD for a Date, in local time. */
export function dateKey(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

/** Monday=0 … Sunday=6 for the day a key names. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = parseKey(key);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

const HOUR_MS = 3_600_000;

/**
 * The day a moment belongs to. A day ends at `dayEndHour` local time, not
 * necessarily midnight: someone up until 1 AM is still having last night.
 */
export function dayKeyOf(t: number, dayEndHour: number): string {
  return dateKey(new Date(t - dayEndHour * HOUR_MS));
}

/**
 * The day key `n` days after `key` (before, for negative `n`). Calendar
 * arithmetic rather than `n * 24h`, which lands on the wrong side of a DST change.
 */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = parseKey(key);
  return dateKey(new Date(y, m - 1, d + n));
}

/** The instant the day named by `key` begins. */
export function dayStartOf(key: string, dayEndHour: number): number {
  const [y, m, d] = parseKey(key);
  return new Date(y, m - 1, d, dayEndHour, 0, 0, 0).getTime();
}

/** The instant it ends, which is the next day's start. */
export function dayEndOf(key: string, dayEndHour: number): number {
  const [y, m, d] = parseKey(key);
  return new Date(y, m - 1, d + 1, dayEndHour, 0, 0, 0).getTime();
}

export interface DayWindow {
  start: number;
  end: number;
}

export function windowOf(key: string, dayEndHour: number): DayWindow {
  return { start: dayStartOf(key, dayEndHour), end: dayEndOf(key, dayEndHour) };
}

/** "Today", "Tomorrow", "Yesterday", else "Mon 12 Oct". */
export function describeDay(key: string, today: string): string {
  if (key === today) return 'Today';
  if (key === shiftDayKey(today, 1)) return 'Tomorrow';
  if (key === shiftDayKey(today, -1)) return 'Yesterday';
  const [y, m, d] = parseKey(key);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parseKey(from);
  const [ty, tm, td] = parseKey(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
