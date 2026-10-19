import type { Need, Practice, PracticeLevel, TimeEntry } from '../types';
import { endOf } from './ledger';
import type { DayWindow } from './time';

/**
 * What each commitment level asks for. One table, so a level is easy to change.
 * `weekMin` is what a level costs against the weekly cap. It is the low end of
 * the "about" range in the product spec (Steady 1.5-2 h, Serious 3-10 h), the
 * floor you commit to, so a cap is never reached on a practice's best week.
 */
export const LEVELS: Record<PracticeLevel, { label: string; sessions: number; minMin: number; weekMin: number }> = {
  paused: { label: 'Paused', sessions: 0, minMin: 0, weekMin: 0 },
  minimal: { label: 'Minimal', sessions: 1, minMin: 10, weekMin: 15 },
  light: { label: 'Light', sessions: 3, minMin: 15, weekMin: 50 },
  steady: { label: 'Steady', sessions: 4, minMin: 20, weekMin: 90 },
  serious: { label: 'Serious', sessions: 6, minMin: 30, weekMin: 180 },
};

/** The levels from least to most, as a picker lists them. */
export const LEVEL_ORDER = ['paused', 'minimal', 'light', 'steady', 'serious'] as const satisfies readonly PracticeLevel[];

/** "4× a week · 20 min", or "Paused". */
export function describeLevel(level: PracticeLevel): string {
  const { label, sessions, minMin } = LEVELS[level];
  return sessions === 0 ? label : `${sessions}× a week · ${minMin} min`;
}

/** The short form for a picker button: "4× · 20 min". */
export function levelHint(level: PracticeLevel): string {
  const { sessions, minMin } = LEVELS[level];
  return sessions === 0 ? 'No target' : `${sessions}× · ${minMin} min`;
}

const isLive = (p: Practice) => p.deletedAt === undefined;

/** The live practices as the list shows them: in order, with Paused ones last. */
export function listPractices(practices: Practice[]): Practice[] {
  return practices
    .filter(isLive)
    .sort((a, b) => Number(a.level === 'paused') - Number(b.level === 'paused') || a.order - b.order);
}

export interface PracticeFields {
  name: string;
  level: PracticeLevel;
  smallStep: string;
  lowStep: string;
  smallNeeds: Need[];
  lowNeeds: Need[];
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

export function updatePractice(
  practices: Practice[],
  id: string,
  patch: Partial<PracticeFields>,
  now: number
): Practice[] {
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

// ── Sessions and time ─────────────────────────────────────────────────────────
//
// Nothing here is stored: a practice's time is read from the ledger. Only Focus
// and Timed entries count as time; Rest only keeps a Flow stretch in one piece.

/** One sitting with a practice: when it began, and how much Focus or Timed time it held. */
export interface PracticeSession {
  startedAt: number;
  ms: number;
}

/**
 * The practice's sessions, oldest first. A Timed entry is a session. A run of
 * back-to-back Flow entries for the practice is one session, with the Focus in
 * it as its length: Rest inside the run does not count, and a gap (a Stop), a
 * Timed entry or another practice's time starts a new one.
 */
export function practiceSessions(entries: TimeEntry[], practiceId: string, now: number): PracticeSession[] {
  const mine = entries
    .filter((e) => e.deletedAt === undefined && e.practiceId === practiceId)
    .sort((a, b) => a.startedAt - b.startedAt);
  const sessions: PracticeSession[] = [];
  let current: PracticeSession | undefined;
  let flowEnd: number | undefined;
  for (const e of mine) {
    const end = endOf(e, now);
    if (e.state === 'timed') {
      sessions.push({ startedAt: e.startedAt, ms: Math.max(0, end - e.startedAt) });
      flowEnd = undefined;
      continue;
    }
    if (flowEnd !== e.startedAt || !current) {
      current = { startedAt: e.startedAt, ms: 0 };
      sessions.push(current);
    }
    if (e.state === 'should') current.ms += Math.max(0, end - e.startedAt);
    flowEnd = end;
  }
  return sessions.filter((s) => s.ms > 0);
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
    if (e.deletedAt !== undefined || e.practiceId !== practiceId || e.state === 'want') continue;
    if (e.endedAt !== null && e.endedAt <= e.startedAt) continue;
    if (first === undefined || e.startedAt < first) first = e.startedAt;
  }
  return first;
}

/** "since June", or "since June 2025" when it was another year. */
export function describeSince(firstAt: number, now: number): string {
  const first = new Date(firstAt);
  const sameYear = first.getFullYear() === new Date(now).getFullYear();
  const month = first.toLocaleDateString(undefined, { month: 'long' });
  return `since ${month}${sameYear ? '' : ` ${first.getFullYear()}`}`;
}
