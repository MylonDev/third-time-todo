import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeEntry, TimerState } from '../types';
import { applyFix, fixRefusal, startState, stopTimer, type Fix } from '../utils/ledger';

interface TimerStore {
  /** The whole ledger, tombstones included. Everything else is derived from it. */
  entries: TimeEntry[];
  start: (state: TimerState) => void;
  stop: () => void;
  /** Returns why the fix was refused, or null once applied. */
  fix: (fix: Fix) => string | null;
}

export const useTimer = create<TimerStore>()(
  persist(
    (set, get) => ({
      entries: [],
      start: (state) => set({ entries: startState(get().entries, state, Date.now()) }),
      stop: () => set({ entries: stopTimer(get().entries, Date.now()) }),
      fix: (fix) => {
        const refusal = fixRefusal(fix);
        if (refusal) return refusal;
        set({ entries: applyFix(get().entries, fix, Date.now()) });
        return null;
      },
    }),
    { name: 'tt2-ledger', version: 1 }
  )
);
