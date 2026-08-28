import type { Mode } from '../types';

/**
 * Difficulty is the label; the ratio is the mechanic. The `Mode` keys stay
 * 'quarter' | 'third' | 'half' so persisted settings and every archived
 * SessionLog.mode keep working — only what the user reads has changed.
 */
export const MODE_CONFIG: Record<Mode, { label: string; ratio: number; description: string; color: string }> = {
  quarter: {
    label: 'Hard',
    ratio: 4,
    description: 'Lean rest — 1 min back for every 4 min active',
    color: 'orange',
  },
  third: {
    label: 'Medium',
    ratio: 3,
    description: 'Balanced — 1 min back for every 3 min active',
    color: 'purple',
  },
  half: {
    label: 'Easy',
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

export function todayKey(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
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
