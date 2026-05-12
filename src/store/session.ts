import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, SessionLog, DailyState, SessionReport, HistoryEntry, FocusTarget } from '../types';
import { applyWork, spendBreak, todayKey } from '../utils/thirdTime';
import { getCurrentPeriodKey } from '../utils/goalPeriod';
import { useTasks } from './tasks';
import { useGoals } from './goals';

type TimerState = 'idle' | 'working' | 'on-break';

interface SessionStore {
  daily: DailyState;
  history: HistoryEntry[];
  timerState: TimerState;
  timerStart: number | null;
  sessionClosedAt: number | null;
  focusedItem: FocusTarget | null;
  focusSegmentStart: number | null; // not persisted — set by startWork/setFocus

  startWork: () => void;
  stopWork: (mode: Mode) => void;
  startBreak: (mode: Mode) => void;
  stopBreak: () => void;
  endSession: (mode: Mode) => SessionReport;
  archiveDay: () => void;
  resetDay: () => void;
  clearTimer: () => void;
  setClosedAt: (t: number | null) => void;
  setFocus: (target: FocusTarget | null) => void;

  getElapsedMs: () => number;
}

function freshDay(): DailyState {
  return { date: todayKey(), bankMs: 0, sessions: [] };
}

// Cross-store time attribution — called inside stopWork / setFocus
function commitFocusSegment(target: FocusTarget, ms: number) {
  if (ms <= 0) return;
  if (target.kind === 'task') {
    useTasks.getState().adjustTrackedMs(target.id, ms);
  } else {
    const { goals, commitTime } = useGoals.getState();
    const goal = goals.find((g) => g.id === target.id);
    if (goal?.type === 'time') {
      commitTime(goal.id, getCurrentPeriodKey(goal), ms);
    }
  }
}

export const useSession = create<SessionStore>()(
  persist(
    (set, get) => ({
      daily: freshDay(),
      history: [],
      timerState: 'idle',
      timerStart: null,
      sessionClosedAt: null,
      focusedItem: null,
      focusSegmentStart: null,

      getElapsedMs: () => {
        const { timerStart } = get();
        return timerStart ? Date.now() - timerStart : 0;
      },

      archiveDay: () => {
        const { daily, history } = get();
        if (daily.sessions.length === 0) return;
        const entry: HistoryEntry = {
          date: daily.date,
          totalWorkMs: daily.sessions.reduce((a, s) => a + s.workMs, 0),
          totalBreakMs: daily.sessions.reduce((a, s) => a + s.breakMs, 0),
          unusedRestMs: Math.max(0, daily.bankMs),
          sessions: daily.sessions,
        };
        const updated = [entry, ...history.filter((h) => h.date !== entry.date)].slice(0, 15);
        set({ history: updated });
      },

      startWork: () => {
        const { daily, focusedItem } = get();
        if (daily.date !== todayKey() && daily.sessions.length > 0) {
          get().archiveDay();
          set({ daily: freshDay() });
        }
        const now = Date.now();
        set({
          timerState: 'working',
          timerStart: now,
          focusSegmentStart: focusedItem ? now : null,
        });
      },

      stopWork: (mode: Mode) => {
        const { timerStart, daily, focusedItem, focusSegmentStart } = get();
        if (!timerStart) return;

        // Commit focused time segment
        if (focusedItem && focusSegmentStart) {
          commitFocusSegment(focusedItem, Date.now() - focusSegmentStart);
        }

        const workMs = Date.now() - timerStart;
        const today = todayKey();
        const base = daily.date === today ? daily : freshDay();
        const newBank = applyWork(base.bankMs, workMs, mode);
        const log: SessionLog = {
          id: crypto.randomUUID(),
          workMs,
          breakMs: 0,
          mode,
          startedAt: timerStart,
        };
        set({
          timerState: 'idle',
          timerStart: null,
          focusSegmentStart: null,
          daily: { ...base, bankMs: newBank, sessions: [...base.sessions, log] },
        });
      },

      startBreak: (mode: Mode) => {
        const { timerState } = get();
        if (timerState === 'working') get().stopWork(mode);
        set({ timerState: 'on-break', timerStart: Date.now() });
      },

      stopBreak: () => {
        const { timerStart, daily } = get();
        if (!timerStart) return;
        const breakMs = Date.now() - timerStart;
        const today = todayKey();
        const base = daily.date === today ? daily : freshDay();
        const newBank = spendBreak(base.bankMs, breakMs);
        const sessions = [...base.sessions];
        if (sessions.length > 0) {
          const last = { ...sessions[sessions.length - 1] };
          last.breakMs += breakMs;
          sessions[sessions.length - 1] = last;
        }
        set({
          timerState: 'idle',
          timerStart: null,
          daily: { ...base, bankMs: newBank, sessions },
        });
      },

      endSession: (mode: Mode): SessionReport => {
        const { timerState } = get();
        if (timerState === 'working') get().stopWork(mode);
        else if (timerState === 'on-break') get().stopBreak();

        const { daily } = get();
        const totalWorkMs = daily.sessions.reduce((a, s) => a + s.workMs, 0);
        const totalBreakMs = daily.sessions.reduce((a, s) => a + s.breakMs, 0);
        const unusedRestMs = Math.max(0, daily.bankMs);

        get().archiveDay();

        set({
          timerState: 'idle',
          timerStart: null,
          focusedItem: null,
          focusSegmentStart: null,
          daily: { ...daily, bankMs: 0, unusedRestMs },
        });

        return {
          totalWorkMs,
          totalBreakMs,
          unusedRestMs,
          mode,
          completedTasks: 0,
          totalTasks: 0,
        };
      },

      resetDay: () =>
        set({
          daily: freshDay(),
          timerState: 'idle',
          timerStart: null,
          sessionClosedAt: null,
          focusedItem: null,
          focusSegmentStart: null,
        }),

      clearTimer: () =>
        set({ timerState: 'idle', timerStart: null, sessionClosedAt: null }),

      setClosedAt: (t) => set({ sessionClosedAt: t }),

      setFocus: (target) => {
        const { timerState, focusedItem, focusSegmentStart } = get();
        // Commit elapsed time for the previously focused item before switching
        if (timerState === 'working' && focusedItem && focusSegmentStart) {
          commitFocusSegment(focusedItem, Date.now() - focusSegmentStart);
        }
        set({
          focusedItem: target,
          focusSegmentStart: timerState === 'working' ? Date.now() : null,
        });
      },
    }),
    {
      name: 'tt-session',
      version: 3,
      migrate: (persisted, version) => {
        const s = persisted as { daily?: DailyState; history?: HistoryEntry[] };
        if (version < 2) {
          return {
            daily: s.daily ?? freshDay(),
            history: (s as { history?: HistoryEntry[] }).history ?? [],
            timerState: 'idle',
            timerStart: null,
            sessionClosedAt: null,
            focusedItem: null,
            focusSegmentStart: null,
          };
        }
        if (version < 3) {
          return {
            ...s,
            focusedItem: null,
            focusSegmentStart: null,
          };
        }
        return s as { daily: DailyState; history: HistoryEntry[] };
      },
      partialize: (s) => ({
        daily: s.daily,
        history: s.history,
        timerState: s.timerState,
        timerStart: s.timerStart,
        sessionClosedAt: s.sessionClosedAt,
        focusedItem: s.focusedItem,
        // focusSegmentStart is intentionally NOT persisted
      }),
    }
  )
);
