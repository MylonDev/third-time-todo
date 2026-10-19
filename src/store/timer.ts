import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeEntry, TimerState } from '../types';
import { stampChanged } from '../sync/merge';
import { applyFix, fixRefusal, settleTimed, startState, startTimed, stopTimer, type Fix } from '../utils/ledger';

/** Every local change is stamped newer than the row it replaced, so it wins when synced. */
const commit = stampChanged<TimeEntry>;

interface TimerStore {
  /** The whole ledger, tombstones included. Everything else is derived from it. */
  entries: TimeEntry[];
  start: (state: TimerState) => void;
  /** Begin a count-down session of this many ms. */
  startTimed: (plannedMs: number) => void;
  stop: () => void;
  /** Close a Timed session whose time is up. A no-op while there is nothing to close. */
  settle: () => void;
  /** Returns why the fix was refused, or null once applied. */
  fix: (fix: Fix) => string | null;
}

export const useTimer = create<TimerStore>()(
  persist(
    (set, get) => ({
      entries: [],
      start: (state) => set({ entries: commit(get().entries, startState(get().entries, state, Date.now())) }),
      startTimed: (plannedMs) =>
        set({ entries: commit(get().entries, startTimed(get().entries, plannedMs, Date.now())) }),
      stop: () => set({ entries: commit(get().entries, stopTimer(get().entries, Date.now())) }),
      settle: () => {
        const settled = settleTimed(get().entries, Date.now());
        if (settled !== get().entries) set({ entries: commit(get().entries, settled) });
      },
      fix: (fix) => {
        const refusal = fixRefusal(fix);
        if (refusal) return refusal;
        set({ entries: commit(get().entries, applyFix(get().entries, fix, Date.now())) });
        return null;
      },
    }),
    { name: 'tt2-ledger', version: 1 }
  )
);
