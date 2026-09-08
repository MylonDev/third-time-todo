import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Habit, HabitFreq } from '../types';
import { dateKey } from '../utils/goalPeriod';

interface AddHabitParams {
  name: string;
  freq: HabitFreq;
  target?: { amount: number; unit: string };
}

interface HabitsState {
  habits: Habit[];
  addHabit: (params: AddHabitParams) => void;
  updateHabit: (id: string, patch: Partial<Omit<Habit, 'id' | 'createdAt' | 'completions'>>) => void;
  deleteHabit: (id: string) => void;
  reorderHabits: (orderedIds: string[]) => void;
  archiveHabit: (id: string) => void;
  restoreHabit: (id: string) => void;
  /** Tick / untick a plain habit for a day (defaults to today). */
  toggleCompletion: (id: string, day?: string) => void;
  /** Set the logged amount for a targeted habit; reaching the target counts as done. */
  logAmount: (id: string, amount: number, day?: string) => void;
}

/**
 * Habits replace the old routines. On first run, seed them from any routine
 * definitions still in `tt-tasks` — one habit per routine step. Completion
 * history is not reconstructed; the routine data is left in storage untouched.
 */
function seedFromRoutines(): Habit[] {
  try {
    if (localStorage.getItem('tt-habits')) return [];
    const raw = localStorage.getItem('tt-tasks');
    if (!raw) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routines: any[] = JSON.parse(raw)?.state?.routines ?? [];
    const habits: Habit[] = [];
    let order = 0;
    for (const r of routines) {
      const freq: HabitFreq =
        r.period === 'weekly'
          ? { kind: 'weekly' }
          : r.period === 'custom'
          ? { kind: 'everyN', n: Math.max(2, r.periodDays ?? 7) }
          : { kind: 'daily' };
      for (const item of r.items ?? []) {
        habits.push({
          id: crypto.randomUUID(),
          name: item.title,
          freq,
          createdAt: r.createdAt ?? Date.now(),
          order: order++,
          completions: {},
        });
      }
    }
    return habits;
  } catch {
    return [];
  }
}

export const useHabits = create<HabitsState>()(
  persist(
    (set) => ({
      habits: seedFromRoutines(),

      addHabit: (params) =>
        set((s) => ({
          habits: [
            ...s.habits,
            {
              id: crypto.randomUUID(),
              name: params.name,
              freq: params.freq,
              target: params.target,
              createdAt: Date.now(),
              order: s.habits.length,
              completions: {},
            },
          ],
        })),

      updateHabit: (id, patch) =>
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),

      deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),

      reorderHabits: (orderedIds) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            const i = orderedIds.indexOf(h.id);
            return i >= 0 ? { ...h, order: i } : h;
          }),
        })),

      archiveHabit: (id) =>
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, archivedAt: Date.now() } : h)),
        })),

      restoreHabit: (id) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const { archivedAt: _drop, ...rest } = h;
            void _drop;
            return rest;
          }),
        })),

      toggleCompletion: (id, day) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const key = day ?? dateKey(new Date());
            const next = { ...h.completions };
            if (next[key]) delete next[key];
            else next[key] = true;
            return { ...h, completions: next };
          }),
        })),

      logAmount: (id, amount, day) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const key = day ?? dateKey(new Date());
            const next = { ...h.completions };
            if (amount <= 0) delete next[key];
            else next[key] = amount;
            return { ...h, completions: next };
          }),
        })),
    }),
    {
      name: 'tt-habits',
      version: 1,
    }
  )
);
