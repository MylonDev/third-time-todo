import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, TimeEntry, DailyState, HistoryEntry } from '../types';
import { todayKey } from '../utils/thirdTime';
import { bankOf, workMsOf, breakMsOf, entriesOverlap, type OpenSegment } from '../utils/ledger';
import { migrateSessionV3 } from './sessionMigrate';
import { useSettings } from './settings';

type TimerState = 'idle' | 'working' | 'on-break';

interface SessionStore {
  daily: DailyState;
  history: HistoryEntry[];
  timerState: TimerState;
  timerStart: number | null;
  sessionClosedAt: number | null;
  activeProjectId?: string;
  activeTaskId?: string;

  openSegment: () => OpenSegment | null;
  bank: () => number;

  startWork: () => void;
  stopWork: (mode: Mode) => void;
  startBreak: (mode: Mode) => void;
  stopBreak: () => void;
  setActive: (projectId?: string, taskId?: string) => void;

  addEntry: (e: TimeEntry) => void;
  updateEntry: (id: string, patch: Partial<TimeEntry>) => void;
  removeEntry: (id: string) => void;

  archiveDay: () => void;
  maybeArchivePreviousDay: () => void;
  resetDay: () => void;
  clearTimer: () => void;
  setClosedAt: (t: number | null) => void;

  getElapsedMs: () => number;
}

function freshDay(): DailyState {
  return { date: todayKey(useSettings.getState().dayEndHour), entries: [] };
}

export const useSession = create<SessionStore>()(
  persist(
    (set, get) => ({
      daily: freshDay(),
      history: [],
      timerState: 'idle',
      timerStart: null,
      sessionClosedAt: null,
      activeProjectId: undefined,
      activeTaskId: undefined,

      getElapsedMs: () => {
        const { timerStart } = get();
        return timerStart ? Date.now() - timerStart : 0;
      },

      /** The timer currently running, in the shape `bankOf` expects — or null if idle. */
      openSegment: () => {
        const { timerState, timerStart, activeProjectId, activeTaskId } = get();
        if (timerState === 'idle' || timerStart === null) return null;
        return {
          kind: timerState === 'working' ? 'work' : 'break',
          startedAt: timerStart,
          mode: useSettings.getState().mode,
          projectId: activeProjectId,
          taskId: activeTaskId,
        };
      },

      bank: () => {
        const { daily } = get();
        return bankOf(daily.entries, get().openSegment(), Date.now());
      },

      archiveDay: () => {
        const { daily, history } = get();
        if (daily.entries.length === 0) return;
        const entry: HistoryEntry = {
          date: daily.date,
          totalWorkMs: workMsOf(daily.entries),
          totalBreakMs: breakMsOf(daily.entries),
          unusedRestMs: Math.max(0, bankOf(daily.entries)),
          entries: daily.entries,
        };
        // Four months. The pace band needs 28 days behind the earliest day it
        // plots, and entries are small.
        const updated = [entry, ...history.filter((h) => h.date !== entry.date)].slice(0, 120);
        set({ history: updated });
      },

      /**
       * Close out a day that has already rolled over. The only place the day
       * boundary is decided — the stop handlers used to decide it too, and
       * discarded the previous day's entries doing it.
       *
       * A timer running across midnight is left alone here: it keeps accruing
       * to the day it started on, and that day is archived once it stops.
       * (The refusal that used to guard that case moved out — Task 6 owns it.)
       */
      maybeArchivePreviousDay: () => {
        const { daily } = get();
        if (daily.date === todayKey(useSettings.getState().dayEndHour)) return;
        if (daily.entries.length > 0) get().archiveDay();
        set({ daily: freshDay() });
      },

      startWork: () => {
        get().maybeArchivePreviousDay();
        set({ timerState: 'working', timerStart: Date.now() });
      },

      stopWork: (mode: Mode) => {
        const { timerStart, daily, activeProjectId, activeTaskId } = get();
        if (!timerStart) return;
        const entry: TimeEntry = {
          id: crypto.randomUUID(),
          kind: 'work',
          startedAt: timerStart,
          endedAt: Date.now(),
          projectId: activeProjectId,
          taskId: activeTaskId,
          mode,
        };
        set({
          timerState: 'idle',
          timerStart: null,
          daily: { ...daily, entries: [...daily.entries, entry].sort((a, b) => a.startedAt - b.startedAt) },
        });
        // The day may have rolled over while the timer was running.
        get().maybeArchivePreviousDay();
      },

      startBreak: (mode: Mode) => {
        const { timerState } = get();
        if (timerState === 'working') get().stopWork(mode);
        set({ timerState: 'on-break', timerStart: Date.now() });
      },

      stopBreak: () => {
        const { timerStart, daily } = get();
        if (!timerStart) return;
        const entry: TimeEntry = {
          id: crypto.randomUUID(),
          kind: 'break',
          startedAt: timerStart,
          endedAt: Date.now(),
          mode: useSettings.getState().mode,
        };
        set({
          timerState: 'idle',
          timerStart: null,
          daily: { ...daily, entries: [...daily.entries, entry].sort((a, b) => a.startedAt - b.startedAt) },
        });
        // The day may have rolled over while the break was running.
        get().maybeArchivePreviousDay();
      },

      setActive: (projectId, taskId) => set({ activeProjectId: projectId, activeTaskId: taskId }),

      addEntry: (e) => {
        const { daily } = get();
        if (daily.entries.some((existing) => entriesOverlap(existing, e))) return;
        set({ daily: { ...daily, entries: [...daily.entries, e].sort((a, b) => a.startedAt - b.startedAt) } });
      },

      updateEntry: (id, patch) => {
        const { daily } = get();
        const current = daily.entries.find((e) => e.id === id);
        if (!current) return;
        const updated = { ...current, ...patch };
        if (daily.entries.some((e) => e.id !== id && entriesOverlap(e, updated))) return;
        const entries = daily.entries
          .map((e) => (e.id === id ? updated : e))
          .sort((a, b) => a.startedAt - b.startedAt);
        set({ daily: { ...daily, entries } });
      },

      removeEntry: (id) => {
        const { daily } = get();
        set({ daily: { ...daily, entries: daily.entries.filter((e) => e.id !== id) } });
      },

      resetDay: () =>
        set({
          daily: freshDay(),
          timerState: 'idle',
          timerStart: null,
          sessionClosedAt: null,
        }),

      // "Reset — start a new session" from the restore prompt. Abandoning the
      // timer just clears it — there is no session boundary left to close.
      clearTimer: () =>
        set({
          timerState: 'idle',
          timerStart: null,
          sessionClosedAt: null,
        }),

      setClosedAt: (t) => set({ sessionClosedAt: t }),
    }),
    {
      name: 'tt-session',
      version: 4,
      migrate: (persisted, version) => {
        let s = persisted as Record<string, unknown>;
        if (version < 2) {
          s = {
            ...s,
            timerState: 'idle',
            timerStart: null,
            sessionClosedAt: null,
            focusedItem: null,
            focusSegmentStart: null,
          };
        }
        if (version < 3) {
          s = { ...s, focusedItem: null, focusSegmentStart: null };
        }
        if (version < 4) {
          s = { ...s, ...migrateSessionV3(s) };
        }
        return s;
      },
      partialize: (s) => ({
        daily: s.daily,
        history: s.history,
        timerState: s.timerState,
        timerStart: s.timerStart,
        activeProjectId: s.activeProjectId,
        activeTaskId: s.activeTaskId,
      }),
    }
  )
);
