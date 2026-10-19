import type { Need, Practice, PracticeLevel } from '../types';

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

const isLive = (p: Practice) => p.deletedAt === undefined;

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
