import type { Practice, TimeEntry } from '../types';
import { endOf, runningEntry } from './ledger';
import { WEEKDAY_LABELS } from './recurrence';
import { dayKeyOf, shiftDayKey, weekdayOfKey, weekWindowOf, windowOf, type DayWindow } from './time';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

/** What a practice asks of you: the part of `Practice` that sets its weekly target. */
export type Target = Pick<Practice, 'targetDays' | 'targetWeekdays' | 'targetMin'>;

export type TemplateKey = 'paused' | 'minimal' | 'light' | 'steady' | 'serious';

/**
 * The presets a target can be picked from. They are only presets: nothing
 * stores the template, a practice stores the three values. The minutes are what
 * a session had to reach under the old levels, so no practice's bar moved.
 */
export const TEMPLATES: Record<TemplateKey, { label: string; days: number; minutes: number }> = {
  paused: { label: 'Paused', days: 0, minutes: 0 },
  minimal: { label: 'Minimal', days: 1, minutes: 10 },
  light: { label: 'Light', days: 3, minutes: 15 },
  steady: { label: 'Steady', days: 4, minutes: 20 },
  serious: { label: 'Serious', days: 6, minutes: 30 },
};

/** The templates from least to most, as a picker lists them. */
export const TEMPLATE_ORDER = ['paused', 'minimal', 'light', 'steady', 'serious'] as const satisfies readonly TemplateKey[];

/** The target a template sets, with no chosen weekdays. */
export function targetOf(template: TemplateKey): Target {
  const { days, minutes } = TEMPLATES[template];
  return { targetDays: days, targetWeekdays: [], targetMin: minutes };
}

/** The template a target matches, or null (Custom). Chosen weekdays always mean Custom. */
export function templateOf(target: Target): TemplateKey | null {
  if (target.targetWeekdays.length > 0) return null;
  return TEMPLATE_ORDER.find((t) => TEMPLATES[t].days === target.targetDays && TEMPLATES[t].minutes === target.targetMin) ?? null;
}

export const isPaused = (p: Pick<Practice, 'targetDays'>) => p.targetDays === 0;

const daysWord = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/** "Steady · 4 days a week · 20 min", "3 days a week · 25 min", "Mon Wed Fri · 30 min", or "Paused". */
export function describeTarget(target: Target): string {
  if (target.targetDays === 0) return TEMPLATES.paused.label;
  const minutes = `${target.targetMin} min`;
  if (target.targetWeekdays.length > 0) {
    const names = [...target.targetWeekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]);
    return `${names.join(' ')} · ${minutes}`;
  }
  const template = templateOf(target);
  const base = `${daysWord(target.targetDays)} a week · ${minutes}`;
  return template ? `${TEMPLATES[template].label} · ${base}` : base;
}

/** The short form for a template button: "4 days · 20 min". */
export function targetHint(template: TemplateKey): string {
  const { days, minutes } = TEMPLATES[template];
  return days === 0 ? 'No target' : `${daysWord(days)} · ${minutes} min`;
}

const isLive = (p: Practice) => p.deletedAt === undefined;

/** The live practices as the list shows them: in order, with Paused ones last. */
export function listPractices(practices: Practice[]): Practice[] {
  return practices.filter(isLive).sort((a, b) => Number(isPaused(a)) - Number(isPaused(b)) || a.order - b.order);
}

export interface PracticeFields extends Target {
  name: string;
}

export function makePractice(practices: Practice[], fields: PracticeFields, now: number): Practice {
  return {
    id: crypto.randomUUID(),
    ...fields,
    order: practices.reduce((m, p) => Math.max(m, p.order), 0) + 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function updatePractice(practices: Practice[], id: string, patch: Partial<PracticeFields>, now: number): Practice[] {
  return practices.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now } : p));
}

/** Tombstone it. The time it logged stays in the ledger. */
export function removePractice(practices: Practice[], id: string, now: number): Practice[] {
  return practices.map((p) => (p.id === id ? { ...p, deletedAt: now, updatedAt: now } : p));
}

/** Set, or with blank text clear, the note for the next session. */
export function setNextStep(practices: Practice[], id: string, text: string, now: number): Practice[] {
  const nextStep = text.trim() || undefined;
  return practices.map((p) => (p.id === id ? { ...p, nextStep, updatedAt: now } : p));
}

/**
 * Move a practice to `index` among the live ones. Only that practice changes:
 * it takes an order between its new neighbours, so a sync sends one row.
 */
export function reorderPractices(practices: Practice[], id: string, index: number, now: number): Practice[] {
  const others = practices.filter((p) => isLive(p) && p.id !== id).sort((a, b) => a.order - b.order);
  const at = Math.min(Math.max(index, 0), others.length);
  const before = others[at - 1]?.order;
  const after = others[at]?.order;
  let order = 1;
  if (before !== undefined && after !== undefined) order = (before + after) / 2;
  else if (before !== undefined) order = before + 1;
  else if (after !== undefined) order = after - 1;
  return practices.map((p) => (p.id === id ? { ...p, order, updatedAt: now } : p));
}

// ── Weekly cap ────────────────────────────────────────────────────────────────

/** What a target costs against the weekly cap, in minutes: days times minutes a day. */
export const weekCost = (target: Target) => target.targetDays * target.targetMin;

/** What the live practices add up to in a week, in minutes. */
export function plannedMinutes(practices: Practice[]): number {
  return practices.filter(isLive).reduce((sum, p) => sum + weekCost(p), 0);
}

/**
 * How many minutes over `cap` the practices would be if practice `id` (a new
 * one when undefined or unknown) took `target`. Never blocks a target that
 * costs no more than the practice does now, so a lowered cap can still be
 * worked down to. No cap is never over.
 */
export function targetOverBy(practices: Practice[], id: string | undefined, target: Target, cap: number | null): number {
  if (cap === null) return 0;
  const current = practices.find((p) => p.id === id && isLive(p));
  if (weekCost(target) <= (current ? weekCost(current) : 0)) return 0;
  const others = plannedMinutes(practices.filter((p) => p.id !== id));
  return Math.max(0, others + weekCost(target) - cap);
}

/** Whether the practice can take `target` without going past the cap. */
export function targetFits(practices: Practice[], id: string | undefined, target: Target, cap: number | null): boolean {
  return targetOverBy(practices, id, target, cap) === 0;
}

// ── Days and time ─────────────────────────────────────────────────────────────
//
// Nothing here is stored: a practice's time is read from the ledger. Only Focus
// and Timed entries count as time; Rest never does.

/** One day of a week and the Focus and Timed time a practice has on it. */
interface DayTotal {
  key: string;
  ms: number;
}

/**
 * A practice's time on each of the seven days of `week`, which starts at a
 * Monday's day start. Each day is its own window, so a stint across a day end
 * is split between the two days.
 */
export function weekTotals(entries: TimeEntry[], practiceId: string, week: DayWindow, now: number, dayEndHour: number): DayTotal[] {
  // This runs on every clock tick, so cut the ledger down once, not once a day.
  const mine = entries.filter(
    (e) => e.practiceId === practiceId && e.deletedAt === undefined && e.state !== 'want' && e.startedAt < week.end && endOf(e, now) > week.start,
  );
  // Noon on Monday is the same day under any day end hour, DST shift or not.
  const monday = dayKeyOf(week.start + 12 * HOUR_MS, dayEndHour);
  return Array.from({ length: 7 }, (_, i) => {
    const key = shiftDayKey(monday, i);
    return { key, ms: practiceTime(mine, practiceId, windowOf(key, dayEndHour), now) };
  });
}

/** Whether a day's time reaches the daily minutes. A target of no minutes counts nothing, not every day. */
const reaches = (day: DayTotal, targetMin: number) => day.ms > 0 && day.ms >= targetMin * MIN_MS;

/** The day keys of the week on which the practice reached its daily minutes. */
export function countedDays(entries: TimeEntry[], practice: Pick<Practice, 'id' | 'targetMin'>, week: DayWindow, now: number, dayEndHour: number): string[] {
  return weekTotals(entries, practice.id, week, now, dayEndHour)
    .filter((d) => reaches(d, practice.targetMin))
    .map((d) => d.key);
}

/** A practice that is behind this week, and how far. */
export interface Attention {
  practice: Practice;
  /** Days that reached the daily minutes so far this week. */
  done: number;
  /** Days still needed to meet the weekly target. */
  left: number;
  /** Days left to do them in, today included. */
  daysLeft: number;
}

/**
 * The practices that still need days this week, most pressing first. One with
 * chosen weekdays that include today, and still short today, comes first.
 * After that the most days left per day left, then the one practised longest
 * ago (or never). Paused and deleted practices, and ones that met their target,
 * are left out. Any weekday can make up a day, so a missed chosen day still
 * counts when done on another; the chosen weekdays only decide what is due and
 * how many days are left.
 */
export function needsAttention(practices: Practice[], entries: TimeEntry[], now: number, dayEndHour: number): Attention[] {
  const today = dayKeyOf(now, dayEndHour);
  const week = weekWindowOf(today, dayEndHour);
  const weekday = weekdayOfKey(today);
  const lasts = lastPracticedAt(entries);
  return practices
    .filter((p) => isLive(p) && !isPaused(p))
    .map((practice) => {
      const days = weekTotals(entries, practice.id, week, now, dayEndHour);
      const counted = days.filter((d) => reaches(d, practice.targetMin));
      const todayDone = counted.some((d) => d.key === today);
      const done = counted.length;
      const left = practice.targetDays - done;
      const daysLeft = daysLeftIn(practice.targetWeekdays, weekday, todayDone, left);
      const todayMs = days.find((d) => d.key === today)?.ms ?? 0;
      const due = left > 0 && practice.targetWeekdays.includes(weekday) && todayMs < practice.targetMin * MIN_MS;
      // Never practised sorts before any real session.
      return { practice, done, left, daysLeft, due, last: lasts.get(practice.id) ?? 0 };
    })
    .filter((a) => a.left > 0)
    .sort((a, b) => Number(b.due) - Number(a.due) || b.left / b.daysLeft - a.left / a.daysLeft || a.last - b.last || a.practice.order - b.practice.order)
    .map(({ practice, done, left, daysLeft }) => ({ practice, done, left, daysLeft }));
}

/**
 * Days left to do `left` more days in, today included. With no chosen weekdays
 * it is the rest of the week. With some it is the chosen ones still ahead
 * (today only if it is not yet done), but never fewer than `left` while the
 * week has days to make them up on, and never more than the week has.
 */
function daysLeftIn(weekdays: number[], weekday: number, todayDone: boolean, left: number): number {
  const rest = 7 - weekday;
  if (weekdays.length === 0) return rest;
  const chosen = weekdays.filter((d) => d > weekday || (d === weekday && !todayDone)).length;
  return Math.min(rest, Math.max(chosen, left));
}

/** Whether an entry is Focus or Timed time on the practice with some length. Rest, deleted and zero-length entries are not. */
function isPracticeTime(e: TimeEntry, practiceId: string): boolean {
  if (e.deletedAt !== undefined || e.practiceId !== practiceId || e.state === 'want') return false;
  return e.endedAt === null || e.endedAt > e.startedAt;
}

/** When each practice's latest Focus or Timed entry began. */
function lastPracticedAt(entries: TimeEntry[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const e of entries) {
    if (e.practiceId === undefined || !isPracticeTime(e, e.practiceId)) continue;
    if (e.startedAt > (last.get(e.practiceId) ?? -Infinity)) last.set(e.practiceId, e.startedAt);
  }
  return last;
}

/**
 * Focus and Timed time on a practice inside `win`. Entries are clipped to the
 * window rather than split, as in `totalsFor`.
 */
export function practiceTime(entries: TimeEntry[], practiceId: string, win: DayWindow, now: number): number {
  let ms = 0;
  for (const e of entries) {
    if (e.deletedAt !== undefined || e.practiceId !== practiceId || e.state === 'want') continue;
    const start = Math.max(e.startedAt, win.start);
    const end = Math.min(endOf(e, now), win.end);
    if (end > start) ms += end - start;
  }
  return ms;
}

/** When the first Focus or Timed time on the practice began, or undefined if there is none. */
export function firstSessionAt(entries: TimeEntry[], practiceId: string): number | undefined {
  let first: number | undefined;
  for (const e of entries) {
    if (!isPracticeTime(e, practiceId)) continue;
    if (first === undefined || e.startedAt < first) first = e.startedAt;
  }
  return first;
}

/** How long after a session ends the app still asks for its next step. */
const NEXT_STEP_WINDOW_MS = 10 * 60_000;

/** The running entry that belongs to a practice, as last seen. */
export interface RunningPractice {
  id: string;
  practiceId: string;
}

/**
 * The practice whose session has just ended, or undefined. `before` is the
 * practice entry that was running at the last look. It has ended when it no
 * longer runs and nothing for the same practice took over (Focus to Rest is
 * the same session), and it ended within ten minutes of `now`, so reopening
 * the app long after a Timed session ran out asks nothing.
 */
export function endedPractice(entries: TimeEntry[], before: RunningPractice | null, now: number): string | undefined {
  if (!before || runningEntry(entries)?.practiceId === before.practiceId) return undefined;
  const closed = entries.find((e) => e.id === before.id);
  if (!closed || closed.deletedAt !== undefined || closed.endedAt === null) return undefined;
  return now - closed.endedAt <= NEXT_STEP_WINDOW_MS ? before.practiceId : undefined;
}

/** "since June", or "since June 2025" when it was another year. */
export function describeSince(firstAt: number, now: number): string {
  const first = new Date(firstAt);
  const sameYear = first.getFullYear() === new Date(now).getFullYear();
  const month = first.toLocaleDateString(undefined, { month: 'long' });
  return `since ${month}${sameYear ? '' : ` ${first.getFullYear()}`}`;
}
