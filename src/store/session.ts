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
  maybeArchivePreviousDay: () => void;
  resetDay: () => void;
  clearTimer: () => void;
  setClosedAt: (t: number | null) => void;
  setFocus: (target: FocusTarget | null) => void;
  setFocusSegmentStart: (t: number | null) => void;
  pruneFocus: () => void;

  getElapsedMs: () => number;
}

function freshDay(): DailyState {
  return { date: todayKey(), bankMs: 0, sessions: [] };
}

/** Only time goals accumulate focused time, so only they can be focused. */
function isFocusable(target: FocusTarget): boolean {
  if (target.kind === 'task') {
    const task = useTasks.getState().tasks.find((t) => t.id === target.id);
    return !!task && task.status !== 'done';
  }
  return useGoals.getState().goals.find((g) => g.id === target.id)?.type === 'time';
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
          // The day's running total from ended sessions, plus anything still
          // sitting unspent in a session that was never formally ended.
          unusedRestMs: (daily.unusedRestMs ?? 0) + Math.max(0, daily.bankMs),
          sessions: daily.sessions,
        };
        const updated = [entry, ...history.filter((h) => h.date !== entry.date)].slice(0, 30);
        set({ history: updated });
      },

      /**
       * Close out a day that has already rolled over. The only place the day
       * boundary is decided — the stop handlers used to decide it too, and
       * discarded the previous day's sessions doing it.
       *
       * A session running across midnight is left alone: it keeps accruing to
       * the day it started on, and that day is archived once it ends.
       */
      maybeArchivePreviousDay: () => {
        const { daily, timerState } = get();
        if (daily.date === todayKey()) return;
        // "Ongoing" means a timer is actually running. A session left open
        // without ending it must not pin the app to yesterday.
        if (timerState !== 'idle') return;
        if (daily.sessions.length > 0) get().archiveDay();
        set({ daily: freshDay() });
      },

      startWork: () => {
        get().maybeArchivePreviousDay();
        const { daily, focusedItem } = get();
        const now = Date.now();
        set({
          timerState: 'working',
          timerStart: now,
          focusSegmentStart: focusedItem ? now : null,
          // First stint after an idle bank opens a new session.
          daily: { ...daily, sessionStartedAt: daily.sessionStartedAt ?? now },
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
        // Write to the day as it stands. Resetting it here dropped the previous
        // day's sessions whenever a session ran across midnight.
        const base = daily;
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
        const base = daily;
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

      /**
       * Ends the session, not the day. The bank is cleared — rest is earned
       * within a session — and whatever was left unspent is added to the day's
       * running total. The day itself is archived when it rolls over.
       */
      endSession: (mode: Mode): SessionReport => {
        const { timerState } = get();
        if (timerState === 'working') get().stopWork(mode);
        else if (timerState === 'on-break') get().stopBreak();

        const { daily } = get();
        const since = daily.sessionStartedAt ?? 0;
        const thisSession = daily.sessions.filter((s) => s.startedAt >= since);

        const unusedRestMs = Math.max(0, daily.bankMs);

        set({
          timerState: 'idle',
          timerStart: null,
          focusedItem: null,
          focusSegmentStart: null,
          daily: {
            ...daily,
            bankMs: 0,
            unusedRestMs: (daily.unusedRestMs ?? 0) + unusedRestMs,
            sessionStartedAt: undefined,
          },
        });

        // The day may have rolled over while the session was running.
        get().maybeArchivePreviousDay();

        return {
          totalWorkMs: thisSession.reduce((a, s) => a + s.workMs, 0),
          totalBreakMs: thisSession.reduce((a, s) => a + s.breakMs, 0),
          unusedRestMs,
          dayWorkMs: daily.sessions.reduce((a, s) => a + s.workMs, 0),
          dayBreakMs: daily.sessions.reduce((a, s) => a + s.breakMs, 0),
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

      // "Reset — start a new session" from the restore prompt. Abandoning the
      // session has to close it, or the next one reports the stints from this
      // one alongside its own.
      clearTimer: () =>
        set((s) => ({
          timerState: 'idle',
          timerStart: null,
          sessionClosedAt: null,
          focusSegmentStart: null,
          daily: { ...s.daily, sessionStartedAt: undefined },
        })),

      setClosedAt: (t) => set({ sessionClosedAt: t }),

      setFocus: (target) => {
        // Refuse targets that can never accrue time — focusing one would silently
        // end the current segment and then record nothing.
        if (target && !isFocusable(target)) return;
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

      // focusSegmentStart is never persisted, so it has to be re-established after a
      // reload — otherwise the timer keeps running and stopWork commits nothing.
      setFocusSegmentStart: (t) => set({ focusSegmentStart: t }),

      // Drops a focus target that no longer exists or is no longer focusable
      // (deleted task, goal retyped away from 'time'), which can survive a reload.
      pruneFocus: () => {
        const { focusedItem } = get();
        if (focusedItem && !isFocusable(focusedItem)) {
          set({ focusedItem: null, focusSegmentStart: null });
        }
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
