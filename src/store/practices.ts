import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Practice } from '../types';
import {
  makePractice,
  removePractice,
  reorderPractices,
  setNextStep,
  updatePractice,
  type PracticeFields,
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
    { name: 'tt2-practices', version: 1 }
  )
);
