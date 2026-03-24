import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, SessionLog, DailyState, SessionReport } from '../types';
import { applyWork, spendBreak, todayKey } from '../utils/thirdTime';

type TimerState = 'idle' | 'working' | 'on-break';

interface SessionStore {
  daily: DailyState;
  timerState: TimerState;
  timerStart: number | null;

  startWork: () => void;
  stopWork: (mode: Mode) => void;
  startBreak: (mode: Mode) => void;
  stopBreak: () => void;
  endSession: (mode: Mode) => SessionReport;
  resetDay: () => void;

  getElapsedMs: () => number;
}

function freshDay(): DailyState {
  return { date: todayKey(), bankMs: 0, sessions: [] };
}

export const useSession = create<SessionStore>()(
  persist(
    (set, get) => ({
      daily: freshDay(),
      timerState: 'idle',
      timerStart: null,

      getElapsedMs: () => {
        const { timerStart } = get();
        return timerStart ? Date.now() - timerStart : 0;
      },

      startWork: () => {
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

        set({ timerState: 'idle', timerStart: null, daily: { ...daily, bankMs: 0 } });

        return {
          totalWorkMs,
          totalBreakMs,
          mode,
          completedTasks: 0, // filled in by the caller who has task context
          totalTasks: 0,
        };
      },

      resetDay: () =>
        set({ daily: freshDay(), timerState: 'idle', timerStart: null }),
    }),
    {
      name: 'tt-session',
      partialize: (s) => ({ daily: s.daily }),
    }
  )
);
