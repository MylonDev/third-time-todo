import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, SessionLog, DailyState, SessionReport, HistoryEntry } from '../types';
import { applyWork, spendBreak, todayKey } from '../utils/thirdTime';

type TimerState = 'idle' | 'working' | 'on-break';

interface SessionStore {
  daily: DailyState;
  history: HistoryEntry[];
  timerState: TimerState;
  timerStart: number | null;
  sessionClosedAt: number | null;

  startWork: () => void;
  stopWork: (mode: Mode) => void;
  startBreak: (mode: Mode) => void;
  stopBreak: () => void;
  endSession: (mode: Mode) => SessionReport;
  archiveDay: () => void;
  resetDay: () => void;
  clearTimer: () => void;
  setClosedAt: (t: number | null) => void;

  getElapsedMs: () => number;
}

function freshDay(): DailyState {
  return { date: todayKey(), bankMs: 0, sessions: [] };
}

export const useSession = create<SessionStore>()(
  persist(
    (set, get) => ({
      daily: freshDay(),
      history: [],
      timerState: 'idle',
      timerStart: null,
      sessionClosedAt: null,

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
        const { daily } = get();
        // Roll over to a new day if needed
        if (daily.date !== todayKey() && daily.sessions.length > 0) {
          get().archiveDay();
          set({ daily: freshDay() });
        }
        set({ timerState: 'working', timerStart: Date.now() });
      },

      stopWork: (mode: Mode) => {
        const { timerStart, daily } = get();
        if (!timerStart) return;
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
          daily: { ...base, bankMs: newBank, sessions: [...base.sessions, log] },
        });
      },

      startBreak: (mode: Mode) => {
        const { timerState } = get();
        // Commit any in-progress work segment before starting break
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
        // Append break time to most recent session
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

        // Archive before zeroing bank
        get().archiveDay();

        set({
          timerState: 'idle',
          timerStart: null,
          daily: { ...daily, bankMs: 0, unusedRestMs },
        });

        return {
          totalWorkMs,
          totalBreakMs,
          unusedRestMs,
          mode,
          completedTasks: 0, // filled in by the caller who has task context
          totalTasks: 0,
        };
      },

      resetDay: () =>
        set({ daily: freshDay(), timerState: 'idle', timerStart: null, sessionClosedAt: null }),

      clearTimer: () =>
        set({ timerState: 'idle', timerStart: null, sessionClosedAt: null }),

      setClosedAt: (t) => set({ sessionClosedAt: t }),
    }),
    {
      name: 'tt-session',
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as { daily?: DailyState; history?: HistoryEntry[] };
        if (version < 2) {
          return {
            daily: s.daily ?? freshDay(),
            history: (s as { history?: HistoryEntry[] }).history ?? [],
            timerState: 'idle',
            timerStart: null,
            sessionClosedAt: null,
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
      }),
    }
  )
);
