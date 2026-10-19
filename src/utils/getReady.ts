import type { GetReadyDay, GetReadyStep, TimeEntry } from '../types';
import { windowOf } from './time';

const isLive = (e: TimeEntry) => e.deletedAt === undefined;

/**
 * Whether pressing Start should offer the checklist: there are steps, it has not
 * been offered today (a day row exists once it was done or skipped), and nothing
 * has begun today. Something has begun when a live entry starts inside today's
 * window and is not the continuation of another (one that ended exactly where it
 * starts, as when Focus is switched to Rest). A session carried past the day end
 * is therefore not a new start, but the next start after it is.
 */
export function shouldOfferGetReady(steps: GetReadyStep[], days: GetReadyDay[], entries: TimeEntry[], today: string, dayEndHour: number): boolean {
  if (steps.length === 0) return false;
  if (days.some((d) => d.id === today)) return false;

  const win = windowOf(today, dayEndHour);
  const live = entries.filter(isLive);
  const begunToday = live.some((e) => e.startedAt >= win.start && e.startedAt < win.end && !live.some((o) => o !== e && o.endedAt === e.startedAt));
  return !begunToday;
}

/** Record what happened on a day, replacing any earlier row for it. Other days are kept. */
export function recordGetReady(days: GetReadyDay[], today: string, done: string[], skipped: boolean, now: number): GetReadyDay[] {
  const row: GetReadyDay = { id: today, done, skipped, updatedAt: now };
  return days.some((d) => d.id === today) ? days.map((d) => (d.id === today ? row : d)) : [...days, row];
}

export function makeStep(text: string): GetReadyStep {
  return { id: crypto.randomUUID(), text: text.trim() };
}

/** Rename a step; blank text removes it. */
export function renameStep(steps: GetReadyStep[], id: string, text: string): GetReadyStep[] {
  const name = text.trim();
  if (!name) return removeStep(steps, id);
  return steps.map((s) => (s.id === id ? { ...s, text: name } : s));
}

/** The list is one value, so a removed step is simply gone. */
export function removeStep(steps: GetReadyStep[], id: string): GetReadyStep[] {
  return steps.filter((s) => s.id !== id);
}

export function sameSteps(a: GetReadyStep[], b: GetReadyStep[]): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i].id && s.text === b[i].text);
}
