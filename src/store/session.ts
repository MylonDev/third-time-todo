import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Mode, TimeEntry, DailyState, HistoryEntry } from '../types';
import { dayKeyOf, todayKey, dayStartOf, dayEndOf } from '../utils/thirdTime';
import { bankOf, workMsOf, breakMsOf, splitAtBoundary, refusalFor, type OpenSegment } from '../utils/ledger';
import { migrateSessionV3 } from './sessionMigrate';
import { useSettings } from './settings';
import { useProjects } from './projects';
import { useTasks } from './tasks';
import { provideSessionBridge } from './sessionBridge';

type TimerState = 'idle' | 'working' | 'on-break';

const HISTORY_DAYS = 120;

/**
 * What a settled close left for the restore prompt to ask about. It is
 * deliberately not persisted: a reload before the prompt is answered settles
 * the new segment afresh, and the stint the earlier settle filed is by then
 * ordinary logged work like any other.
 */
interface RestorePrompt {
  /** How long the timer had been running when the app went away. */
  settledMs: number;
  /** The entries the settle filed — what "Discard it" has to take back. */
  entryIds: string[];
}

interface SessionStore {
  daily: DailyState;
  history: HistoryEntry[];
  timerState: TimerState;
  timerStart: number | null;
  sessionClosedAt: number | null;
  restorePrompt: RestorePrompt | null;
  activeProjectId?: string;
  activeTaskId?: string;

  openSegment: () => OpenSegment | null;
  bank: () => number;

  startWork: () => void;
  stopWork: (mode: Mode) => void;
  startBreak: (mode: Mode) => void;
  stopBreak: () => void;
  setActive: (projectId?: string, taskId?: string) => void;

  /*
   * The timeline's doors into the ledger, for today and any archived day.
   * Each returns why it refused, or null once the edit is in. See `refusalFor`.
   */
  addEntry: (e: TimeEntry) => string | null;
  updateEntry: (id: string, patch: Partial<Omit<TimeEntry, 'id'>>) => string | null;
  removeEntry: (id: string) => void;
  /** Cut one entry in two at `at`; both halves keep kind, project, task and mode. */
  splitEntry: (id: string, at: number) => string | null;

  archiveDay: () => void;
  maybeArchivePreviousDay: () => void;
  resetDay: () => void;
  setClosedAt: (t: number | null) => void;

  settleClosedSession: () => void;
  continueRestoredSession: () => void;
  resumeRestoredSession: () => void;
  discardRestoredSession: () => void;

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

/** A break credits nothing, so it names nothing. */
function withoutBreakTargets(e: TimeEntry): TimeEntry {
  return e.kind === 'break' ? { ...e, projectId: undefined, taskId: undefined } : e;
}

export const useSession = create<SessionStore>()(
  persist(
    (set, get) => {
      /**
       * True while a timer that was running when the app went away is still
       * waiting to be ruled on. The stretch since the close stamp is the
       * prompt's business — nothing may credit it, or split on it, in the
       * meantime.
       */
      const restorePending = () =>
        get().timerState !== 'idle' && get().sessionClosedAt !== null;

      /** The one place a closing entry hands its time to what it names. */
      const creditWork = (entry: TimeEntry) => {
        const ms = entry.endedAt - entry.startedAt;
        if (entry.kind !== 'work' || ms <= 0) return;
        // Bucket by when the work happened rather than by when it is being
        // committed — a boundary-split half is filed after the boundary it
        // belongs in front of.
        if (entry.projectId) useProjects.getState().commitTime(entry.projectId, ms, entry.startedAt);
        if (entry.taskId) useTasks.getState().adjustTrackedMs(entry.taskId, ms);
      };

      const fileEntry = (entry: TimeEntry) => {
        const { daily } = get();
        set({
          daily: {
            ...daily,
            entries: [...daily.entries, entry].sort((a, b) => a.startedAt - b.startedAt),
          },
        });
      };

      /**
       * Close out a day that has already rolled over, as of `now`. The only
       * place the day boundary is decided — the stop handlers used to decide
       * it too, and discarded the previous day's entries doing it.
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
       * `now` is what makes the split honest. It is the clock for an ordinary
       * roll, and the close stamp when a settle is replaying a day that
       * turned while the app was away — the open segment cannot be credited
       * past the last moment somebody was actually here.
       *
       * This only ever resolves one boundary, then jumps straight to the day
       * `now` falls in — the same way the plain archive-and-reset below always
       * has. A timer left running for several days still gets its first day
       * split out correctly; the rest lands as one long block on the far side,
       * for the user to trim. Walking every intervening day instead would mean
       * archiving days that were never opened and have nothing in them —
       * pure overhead for a case ("forgot for a week") the split already
       * degrades gracefully on.
       */
      const rollDayAt = (now: number) => {
        const { daily } = get();
        const dayEndHour = useSettings.getState().dayEndHour;
        const day = dayKeyOf(now, dayEndHour);
        if (daily.date === day) return;

        const boundary = dayEndOf(daily.date, dayEndHour);
        const open = get().openSegment();
        if (open && open.startedAt < boundary && now > boundary) {
          const { closed, reopened } = splitAtBoundary(open, boundary, now);
          // This is a real closing entry, same as the ones `stopWork` and
          // `setActive` produce — it needs the same one-time credit, right
          // here, or the pre-boundary half is credited nowhere. The reopened
          // far side is a fresh open segment under the same ids; whatever
          // eventually closes it (a plain `stopWork`, most likely) commits
          // that half on its own, so there is no double-count here.
          creditWork(closed);
          fileEntry(closed);
          set({ timerStart: reopened.startedAt });
        }
        if (get().daily.entries.length > 0) get().archiveDay();
        set({ daily: { date: day, entries: [] } });
      };

      /** The entries filed under `date` — today's live list, or an archived day's. */
      const entriesOn = (date: string): TimeEntry[] => {
        const { daily, history } = get();
        if (daily.date === date) return daily.entries;
        return history.find((h) => h.date === date)?.entries ?? [];
      };

      const dayOfEntry = (id: string): string | null => {
        const { daily, history } = get();
        if (daily.entries.some((e) => e.id === id)) return daily.date;
        return history.find((h) => h.entries.some((e) => e.id === id))?.date ?? null;
      };

      const refuse = (date: string, candidate: TimeEntry, others: TimeEntry[]): string | null => {
        const { daily, timerStart, timerState } = get();
        if (date > daily.date) return 'That day hasn’t happened yet.';
        const dayEndHour = useSettings.getState().dayEndHour;
        // Only today has a running timer to stay clear of; past days are
        // claimable right up to their end.
        const claimableUntil =
          date === daily.date
            ? timerState !== 'idle' && timerStart !== null
              ? Math.min(timerStart, Date.now())
              : Date.now()
            : Infinity;
        return refusalFor(
          candidate,
          others,
          { start: dayStartOf(date, dayEndHour), end: dayEndOf(date, dayEndHour) },
          claimableUntil
        );
      };

      /**
       * Replace a day's entries and re-derive everything summed from them
       * (spec 2.3): an archived day's totals, then every project and task.
       * `unusedRestMs` stays as archived — it records what the bank held at
       * turnover, which an edit made afterwards can't rewind.
       */
      const writeDay = (date: string, next: TimeEntry[]) => {
        const entries = [...next].sort((a, b) => a.startedAt - b.startedAt);
        const { daily, history } = get();
        if (daily.date === date) {
          set({ daily: { ...daily, entries } });
        } else {
          const existing = history.find((h) => h.date === date);
          const updated: HistoryEntry = {
            date,
            unusedRestMs: existing?.unusedRestMs ?? 0,
            totalWorkMs: workMsOf(entries),
            totalBreakMs: breakMsOf(entries),
            entries,
          };
          set({
            history: [updated, ...history.filter((h) => h.date !== date)].sort((a, b) =>
              b.date.localeCompare(a.date)
            ),
          });
        }
        const s = get();
        recomputeAggregates(s.daily, s.history);
      };

      return {
        daily: freshDay(),
        history: [],
        timerState: 'idle',
        timerStart: null,
        sessionClosedAt: null,
        restorePrompt: null,
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
          // A day can come round twice — moving `dayEndHour` later just after
          // midnight steps "today" back onto a day already archived. Its
          // earlier entries are merged in, never replaced.
          const earlier = history.find((h) => h.date === daily.date)?.entries ?? [];
          const entries = [...earlier, ...daily.entries].sort((a, b) => a.startedAt - b.startedAt);
          const entry: HistoryEntry = {
            date: daily.date,
            totalWorkMs: workMsOf(entries),
            totalBreakMs: breakMsOf(entries),
            unusedRestMs: Math.max(0, bankOf(entries)),
            entries,
          };
          // Four months. The pace band needs 28 days behind the earliest day it
          // plots, and entries are small.
          const all = [entry, ...history.filter((h) => h.date !== entry.date)].sort((a, b) =>
            b.date.localeCompare(a.date)
          );
          const kept = all.slice(0, HISTORY_DAYS);
          // What ages out stops being ledger, but the time it credited is
          // still real. Hand it to the carried balances before it goes, or
          // the next re-sum drops it from every project and task total.
          const leaving = all.slice(HISTORY_DAYS).flatMap((h) => h.entries);
          useProjects.getState().carryForward(leaving);
          useTasks.getState().carryForward(leaving);
          set({ history: kept });
        },

        maybeArchivePreviousDay: () => {
          // A timer that was running when the app went away has an honest end
          // — the close stamp — and until the person has said what to do about
          // the stretch since, no part of that stretch may reach the ledger.
          // `settleClosedSession` is what supplies that end; the roll waits.
          if (restorePending()) return;
          rollDayAt(Date.now());
        },

        /**
         * Close the timer at the moment the app went away, before anything
         * else reads the ledger. Everything up to the close stamp is work (or
         * rest) that really happened and is filed as such; everything after it
         * is wall-clock nobody was present for, which the restore prompt then
         * asks about on its own. Splitting the open segment first is what
         * makes that separation hold by construction — there is no longer a
         * segment spanning the gap for a later stop, roll or reload to credit.
         */
        settleClosedSession: () => {
          const { timerState, timerStart, sessionClosedAt } = get();
          if (timerState === 'idle' || timerStart === null || sessionClosedAt === null) return;
          // Nothing real is left between the two: either this has already run
          // (the segment now starts at the close stamp) or the clock moved
          // backwards. Returning here keeps a second pass from filing a
          // zero-length entry and from blanking what the first put in front of
          // the prompt.
          if (sessionClosedAt <= timerStart) return;

          // The day may have turned while the app was still open, in which
          // case that boundary is honest and its near half belongs to the day
          // it happened on.
          rollDayAt(sessionClosedAt);

          const open = get().openSegment();
          if (!open) return;
          const entry: TimeEntry = {
            id: crypto.randomUUID(),
            kind: open.kind,
            startedAt: open.startedAt,
            endedAt: sessionClosedAt,
            projectId: open.kind === 'work' ? open.projectId : undefined,
            taskId: open.kind === 'work' ? open.taskId : undefined,
            mode: open.mode,
          };
          creditWork(entry);
          fileEntry(entry);
          set({
            // The timer keeps running, but from the close stamp: whatever the
            // prompt decides about the gap, the stint before it is settled.
            timerStart: sessionClosedAt,
            restorePrompt: {
              settledMs: sessionClosedAt - timerStart,
              entryIds: [entry.id],
            },
          });
        },

        /**
         * "Continue" — the gap was not work, so the timer starts a fresh
         * segment now. What was done before the app went away is already in
         * the ledger, which is why this can afford to start from zero.
         */
        continueRestoredSession: () => {
          set({ timerStart: Date.now(), sessionClosedAt: null, restorePrompt: null });
          get().maybeArchivePreviousDay();
        },

        /**
         * "Resume" — count the time away as active time or rest taken. The
         * only path that credits a stretch nobody was here for, which is why
         * the prompt offers it only inside its half-hour cutoff.
         */
        resumeRestoredSession: () => {
          const { sessionClosedAt, timerStart } = get();
          set({
            timerStart: sessionClosedAt ?? timerStart,
            sessionClosedAt: null,
            restorePrompt: null,
          });
          get().maybeArchivePreviousDay();
        },

        /**
         * "Discard it" — abandon the session that was still open. The time the
         * settle filed for it goes back out of the ledger too, or the user
         * keeps minutes they have just said to throw away. A half that the day
         * roll had already archived stays put: a day that has been closed out
         * is not reopened.
         */
        discardRestoredSession: () => {
          const { daily, history, restorePrompt } = get();
          const dropped = new Set(restorePrompt?.entryIds ?? []);
          const entries = daily.entries.filter((e) => !dropped.has(e.id));
          set({
            daily: { ...daily, entries },
            timerState: 'idle',
            timerStart: null,
            sessionClosedAt: null,
            restorePrompt: null,
          });
          recomputeAggregates({ ...daily, entries }, history);
          get().maybeArchivePreviousDay();
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
          const { timerStart, activeProjectId, activeTaskId } = get();
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
          // Credit whatever the entry actually names — a project directly, or a
          // task (which is itself only ever tagged with its own project, kept in
          // sync by `setActive`). Either, both, or neither can be empty; an
          // entry with no target is still an honest record of unattributed time.
          creditWork(entry);
          fileEntry(entry);
          set({ timerState: 'idle', timerStart: null });
        },

        startBreak: (mode: Mode) => {
          const { timerState } = get();
          if (timerState === 'working') get().stopWork(mode);
          set({ timerState: 'on-break', timerStart: Date.now() });
        },

        stopBreak: () => {
          // Same reasoning as stopWork: check while the segment is still open.
          get().maybeArchivePreviousDay();
          const { timerStart } = get();
          if (!timerStart) return;
          const entry: TimeEntry = {
            id: crypto.randomUUID(),
            kind: 'break',
            startedAt: timerStart,
            endedAt: Date.now(),
            mode: useSettings.getState().mode,
          };
          fileEntry(entry);
          set({ timerState: 'idle', timerStart: null });
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
          const { timerState, timerStart, activeProjectId, activeTaskId } = get();
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
          creditWork(entry);
          fileEntry(entry);
          set({
            timerStart: now,
            activeProjectId: resolvedProjectId,
            activeTaskId: taskId,
          });
        },

        addEntry: (e) => {
          const date = dayKeyOf(e.startedAt, useSettings.getState().dayEndHour);
          const clean = withoutBreakTargets(e);
          const refusal = refuse(date, clean, entriesOn(date));
          if (refusal) return refusal;
          writeDay(date, [...entriesOn(date), clean]);
          return null;
        },

        updateEntry: (id, patch) => {
          const date = dayOfEntry(id);
          if (!date) return 'That entry no longer exists.';
          const entries = entriesOn(date);
          const current = entries.find((e) => e.id === id)!;
          const updated = withoutBreakTargets({ ...current, ...patch, id });
          // Trimmed to nothing is a deletion, not an error.
          if (updated.endedAt === updated.startedAt) {
            get().removeEntry(id);
            return null;
          }
          const others = entries.filter((e) => e.id !== id);
          const refusal = refuse(date, updated, others);
          if (refusal) return refusal;
          writeDay(date, [...others, updated]);
          return null;
        },

        removeEntry: (id) => {
          const date = dayOfEntry(id);
          if (!date) {
            // Nothing to remove, but callers rely on this to settle the
            // totals against the ledger as it stands.
            const { daily, history } = get();
            recomputeAggregates(daily, history);
            return;
          }
          writeDay(date, entriesOn(date).filter((e) => e.id !== id));
        },

        splitEntry: (id, at) => {
          const date = dayOfEntry(id);
          if (!date) return 'That entry no longer exists.';
          const entries = entriesOn(date);
          const current = entries.find((e) => e.id === id)!;
          if (!(at > current.startedAt && at < current.endedAt)) {
            return 'Pick a time inside the block to split it.';
          }
          const first = { ...current, endedAt: at };
          const second = { ...current, id: crypto.randomUUID(), startedAt: at };
          writeDay(date, [...entries.filter((e) => e.id !== id), first, second]);
          return null;
        },

        resetDay: () =>
          set({
            daily: freshDay(),
            timerState: 'idle',
            timerStart: null,
            sessionClosedAt: null,
            restorePrompt: null,
          }),

        setClosedAt: (t) => set({ sessionClosedAt: t }),
      };
    },
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

// How the project and task stores reach the ledger and the running timer
// without importing this module back. See `sessionBridge.ts`.
provideSessionBridge({
  resyncAggregates: () => {
    const { daily, history } = useSession.getState();
    recomputeAggregates(daily, history);
  },
  reattributeActiveTask: (taskId) => {
    const { activeTaskId, setActive } = useSession.getState();
    // Re-aiming at the same task is what closes the running segment under the
    // old project and reopens it under the new one.
    if (activeTaskId === taskId) setActive(undefined, taskId);
  },
  forgetProject: (projectId) => {
    const { activeProjectId, activeTaskId, setActive } = useSession.getState();
    if (activeProjectId === projectId) setActive(undefined, activeTaskId);
  },
});
