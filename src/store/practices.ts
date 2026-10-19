import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Practice } from '../types';
import {
  makePractice,
  removePractice,
  reorderPractices,
  setNextStep,
  targetOf,
  TEMPLATES,
  updatePractice,
  type PracticeFields,
  type TemplateKey,
} from '../utils/practices';
import { stampChanged } from '../sync/merge';

/** Every local change is stamped newer than the row it replaced, so it wins when synced. */
const commit = stampChanged<Practice>;

interface PracticesStore {
  /** Every practice, tombstones included. */
  practices: Practice[];
  add: (fields: PracticeFields) => void;
  edit: (id: string, patch: Partial<PracticeFields>) => void;
  remove: (id: string) => void;
  /** Move to this position among the live practices. */
  reorder: (id: string, index: number) => void;
  setNextStep: (id: string, text: string) => void;
}

/** The fields version 1 stored for a commitment level, which version 2 no longer has. */
const REMOVED_IN_V2 = ['level', 'smallStep', 'lowStep', 'smallNeeds', 'lowNeeds'];

/**
 * Version 1 stored a level; version 2 stores the target it stood for. Anything
 * else (updatedAt included) is kept as it was, so a practice migrated here is
 * the same as one the server backfilled from its level.
 */
export function migratePractices(state: unknown, version: number): { practices: Practice[] } {
  const stored = (state as { practices?: unknown } | null)?.practices;
  const old = Array.isArray(stored) ? (stored as Record<string, unknown>[]) : [];
  if (version >= 2) return { practices: old as unknown as Practice[] };
  const practices = old.map((p) => {
    const level = p.level as string;
    const next: Record<string, unknown> = { ...p, ...targetOf(Object.hasOwn(TEMPLATES, level) ? (level as TemplateKey) : 'paused') };
    for (const key of REMOVED_IN_V2) delete next[key];
    return next as unknown as Practice;
  });
  return { practices };
}

export const usePractices = create<PracticesStore>()(
  persist(
    (set, get) => ({
      practices: [],
      add: (fields) => {
        const name = fields.name.trim();
        if (!name) return;
        const now = Date.now();
        const { practices } = get();
        set({ practices: commit(practices, [...practices, makePractice(practices, { ...fields, name }, now)]) });
      },
      edit: (id, patch) => {
        const { practices } = get();
        set({ practices: commit(practices, updatePractice(practices, id, patch, Date.now())) });
      },
      remove: (id) => {
        const { practices } = get();
        set({ practices: commit(practices, removePractice(practices, id, Date.now())) });
      },
      reorder: (id, index) => {
        const { practices } = get();
        set({ practices: commit(practices, reorderPractices(practices, id, index, Date.now())) });
      },
      setNextStep: (id, text) => {
        const { practices } = get();
        set({ practices: commit(practices, setNextStep(practices, id, text, Date.now())) });
      },
    }),
    { name: 'tt2-practices', version: 2, migrate: migratePractices },
  ),
);
