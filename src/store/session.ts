import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, TimeEntry, DailyState, HistoryEntry } from '../types';
import { todayKey, dayEndOf } from '../utils/thirdTime';
import { bankOf, workMsOf, breakMsOf, entriesOverlap, splitAtBoundary, type OpenSegment } from '../utils/ledger';
import { migrateSessionV3 } from './sessionMigrate';
import { useSettings } from './settings';
import { useProjects } from './projects';
import { useTasks } from './tasks';

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

/**
 * The full ledger — every entry any project or task total is ever summed
 * from, not just today's. A project's older period buckets live only in
 * history; recomputing from `daily` alone would zero them out the moment
 * anyone edited or removed an entry from today.
 */
function allEntries(daily: DailyState, history: HistoryEntry[]): TimeEntry[] {
  return [...history.flatMap((h) => h.entries), ...daily.entries];
}

/**
 * `addEntry`/`updateEntry`/`removeEntry` are the editable-timeline's doors
 * into the ledger — a delta patched onto a project's or task's total at the
 * moment of the edit is only ever right until the next edit touches the same
 * entry, so every one of them re-sums from scratch instead.
 */
function recomputeAggregates(daily: DailyState, history: HistoryEntry[]): void {
  const entries = allEntries(daily, history);
  useProjects.getState().recomputeFrom(entries);
  useTasks.getState().recomputeFrom(entries);
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
       * With no End Session button, a timer left running across the boundary
       * is the ordinary case, not the exception — so it isn't left alone. If
       * one is still open when the stored day ends, it is split at that day's
       * own boundary: the near side closes into the day being archived, and
       * an identical segment reopens on the far side. That keeps `timerStart`
       * truthful — it never points at a day that's already been archived —
       * so a stint that spans the boundary files each part under the day it
       * actually happened on, wherever this runs: on mount, at the scheduled
       * turnover, or at the top of a stop handler.
       *
       * This only ever resolves one boundary, then jumps straight to today —
       * the same way the plain archive-and-reset below always has. A timer
       * left running for several days still gets its first day split out
       * correctly; the rest lands as one long block on today's side, for the
       * user to trim. Walking every intervening day instead would mean
       * archiving days that were never opened and have nothing in them —
       * pure overhead for a case ("forgot for a week") the split already
       * degrades gracefully on.
       */
      maybeArchivePreviousDay: () => {
        const { daily } = get();
        const dayEndHour = useSettings.getState().dayEndHour;
        if (daily.date === todayKey(dayEndHour)) return;

        const boundary = dayEndOf(daily.date, dayEndHour);
        const open = get().openSegment();
        if (open && open.startedAt < boundary) {
          const { closed, reopened } = splitAtBoundary(open, boundary, Date.now());
          // This is a real closing entry, same as the ones `stopWork` and
          // `setActive` produce — it needs the same one-time credit, right
          // here, or the pre-boundary half is credited nowhere. The reopened
          // far side is a fresh open segment under the same ids; whatever
          // eventually closes it (a plain `stopWork`, most likely) commits
          // that half on its own, so there is no double-count here.
          const ms = closed.endedAt - closed.startedAt;
          if (closed.kind === 'work' && ms > 0) {
            // The pre-boundary half happened before today's boundary even
            // though it's being committed after it — bucket it by its own
            // `startedAt` or it lands in today's period instead of yesterday's.
            if (closed.projectId) useProjects.getState().commitTime(closed.projectId, ms, closed.startedAt);
            if (closed.taskId) useTasks.getState().adjustTrackedMs(closed.taskId, ms);
          }
          set({
            daily: {
              ...daily,
              entries: [...daily.entries, closed].sort((a, b) => a.startedAt - b.startedAt),
            },
            timerStart: reopened.startedAt,
          });
        }
        if (get().daily.entries.length > 0) get().archiveDay();
        set({ daily: { date: todayKey(dayEndHour), entries: [] } });
      },

      startWork: () => {
        get().maybeArchivePreviousDay();
        set({ timerState: 'working', timerStart: Date.now() });
      },

      stopWork: (mode: Mode) => {
        // Before anything else — the timer may still be open from a day
        // that already ended, and that's only detectable (and splittable)
        // while it's still open. Read `timerStart`/`daily` fresh afterward,
        // since a split rewrites both.
        get().maybeArchivePreviousDay();
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
        const ms = entry.endedAt - entry.startedAt;
        // Credit whatever the entry actually names — a project directly, or a
        // task (which is itself only ever tagged with its own project, kept in
        // sync by `setActive`). Either, both, or neither can be empty; an
        // entry with no target is still an honest record of unattributed time.
        if (ms > 0) {
          if (entry.projectId) useProjects.getState().commitTime(entry.projectId, ms, entry.startedAt);
          if (entry.taskId) useTasks.getState().adjustTrackedMs(entry.taskId, ms);
        }
        set({
          timerState: 'idle',
          timerStart: null,
          daily: { ...daily, entries: [...daily.entries, entry].sort((a, b) => a.startedAt - b.startedAt) },
        });
      },

      startBreak: (mode: Mode) => {
        const { timerState } = get();
        if (timerState === 'working') get().stopWork(mode);
        set({ timerState: 'on-break', timerStart: Date.now() });
      },

      stopBreak: () => {
        // Same reasoning as stopWork: check while the segment is still open.
        get().maybeArchivePreviousDay();
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
      },

      /**
       * When a task is the target, the project it credits is the task's own
       * project — never a project picked independently of it — so a task's
       * time always lands where the task itself is filed.
       *
       * A work timer already running is the interesting case: a single entry
       * must never smear across two projects, so the segment open under the
       * old target is closed and committed right here, at `now`, and a fresh
       * one opens immediately under the new target. Idle or on a break, there
       * is no open segment to protect — the ids are just swapped.
       */
      setActive: (projectId, taskId) => {
        const resolvedProjectId = taskId
          ? useTasks.getState().tasks.find((t) => t.id === taskId)?.projectId ?? undefined
          : projectId;

        get().maybeArchivePreviousDay();
        const { timerState, timerStart, daily, activeProjectId, activeTaskId } = get();
        const now = Date.now();

        if (timerState !== 'working' || !timerStart || now <= timerStart) {
          set({ activeProjectId: resolvedProjectId, activeTaskId: taskId });
          return;
        }

        const entry: TimeEntry = {
          id: crypto.randomUUID(),
          kind: 'work',
          startedAt: timerStart,
          endedAt: now,
          projectId: activeProjectId,
          taskId: activeTaskId,
          mode: useSettings.getState().mode,
        };
        const ms = entry.endedAt - entry.startedAt;
        if (entry.projectId) useProjects.getState().commitTime(entry.projectId, ms, entry.startedAt);
        if (entry.taskId) useTasks.getState().adjustTrackedMs(entry.taskId, ms);

        set({
          daily: { ...daily, entries: [...daily.entries, entry].sort((a, b) => a.startedAt - b.startedAt) },
          timerStart: now,
          activeProjectId: resolvedProjectId,
          activeTaskId: taskId,
        });
      },

      addEntry: (e) => {
        const { daily, history } = get();
        if (daily.entries.some((existing) => entriesOverlap(existing, e))) return;
        const entries = [...daily.entries, e].sort((a, b) => a.startedAt - b.startedAt);
        set({ daily: { ...daily, entries } });
        recomputeAggregates({ ...daily, entries }, history);
      },

      updateEntry: (id, patch) => {
        const { daily, history } = get();
        const current = daily.entries.find((e) => e.id === id);
        if (!current) return;
        const updated = { ...current, ...patch };
        if (daily.entries.some((e) => e.id !== id && entriesOverlap(e, updated))) return;
        const entries = daily.entries
          .map((e) => (e.id === id ? updated : e))
          .sort((a, b) => a.startedAt - b.startedAt);
        set({ daily: { ...daily, entries } });
        recomputeAggregates({ ...daily, entries }, history);
      },

      removeEntry: (id) => {
        const { daily, history } = get();
        const entries = daily.entries.filter((e) => e.id !== id);
        set({ daily: { ...daily, entries } });
        recomputeAggregates({ ...daily, entries }, history);
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
        sessionClosedAt: s.sessionClosedAt,
        activeProjectId: s.activeProjectId,
        activeTaskId: s.activeTaskId,
      }),
    }
  )
);
