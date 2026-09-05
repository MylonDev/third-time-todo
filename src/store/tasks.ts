import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Task, TaskStatus, SubTask, Routine, RoutineItem, GoalPeriod, RoutineHistory,
} from '../types';
import { todayKey, tomorrowKey } from '../utils/thirdTime';
import { getPeriodKey } from '../utils/goalPeriod';

interface TasksState {
  tasks: Task[];
  routines: Routine[];
  routineHistory: RoutineHistory;
  addTask: (title: string, scheduledDate: string) => void;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;
  restoreTask: (task: Task) => void;
  moveToTomorrow: (id: string) => void;
  reorderTasks: (orderedIds: string[]) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  editSubtask: (taskId: string, subtaskId: string, title: string) => void;
  /** Moves unfinished tasks from past days into today, returning their ids. */
  rolloverPastTasks: () => string[];
  adjustTrackedMs: (id: string, deltaMs: number) => void;

  addRoutine: (title: string, period: GoalPeriod, periodDays?: number) => void;
  updateRoutine: (id: string, patch: Partial<Omit<Routine, 'id' | 'createdAt' | 'items'>>) => void;
  deleteRoutine: (id: string) => void;
  reorderRoutines: (orderedIds: string[]) => void;
  addRoutineItem: (routineId: string, title: string) => void;
  updateRoutineItem: (routineId: string, itemId: string, title: string) => void;
  deleteRoutineItem: (routineId: string, itemId: string) => void;
  reorderRoutineItems: (routineId: string, orderedIds: string[]) => void;
  snoozeRoutine: (id: string) => void;
  spawnDueRoutines: () => void;
}

/**
 * A task row as some earlier version of the store persisted it. Every field is
 * optional and `status` admits the two values that were dropped in v3, because
 * which of them a given record carries is exactly what `migrate` decides.
 */
type PersistedTask = Partial<Omit<Task, 'status'>> & {
  status?: TaskStatus | 'in-progress' | 'parked';
};

/** The persisted root, at whatever version it was last written. */
interface PersistedTasksState {
  tasks?: PersistedTask[];
  routines?: Routine[];
  routineHistory?: RoutineHistory;
}

/**
 * Checklists used to be their own store. They were the same idea as a recurring
 * task, so they become routines here. The old `tt-checklists` key is left in
 * place rather than deleted, so nothing is lost if this needs unpicking.
 */
function migrateChecklists(existingTasks: PersistedTask[]): Routine[] {
  try {
    const raw = localStorage.getItem('tt-checklists');
    if (!raw) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lists: any[] = JSON.parse(raw)?.state?.checklists ?? [];
    const today = todayKey();
    // Items already ticked off today become completed tasks, so the day's
    // progress survives the move.
    let order = existingTasks.filter((t) => t.scheduledDate === today).length;
    const spawned: Task[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routines: Routine[] = lists.map((c: any, i: number) => {
      const period: GoalPeriod = c.period ?? 'daily';
      const key = getPeriodKey(period, c.periodDays, c.createdAt ?? Date.now());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c.items ?? []).forEach((item: any) => {
        spawned.push({
          id: crypto.randomUUID(),
          title: item.title,
          status: item.done ? 'done' : 'todo',
          createdAt: c.createdAt ?? Date.now(),
          scheduledDate: today,
          order: order++,
          subtasks: [],
          trackedMs: 0,
          routineId: c.id,
        });
      });
      return {
        id: c.id,
        title: c.title,
        period,
        periodDays: c.periodDays,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (c.items ?? []).map((item: any) => ({ id: item.id, title: item.title })),
        createdAt: c.createdAt ?? Date.now(),
        order: c.order ?? i,
        lastSpawnKey: key,
        snoozedUntil: c.snoozedUntil,
      };
    });

    existingTasks.push(...spawned);
    return routines;
  } catch {
    return [];
  }
}

export interface PendingRoutine {
  routine: Routine;
  steps: Task[];
}

/**
 * Routines that still have something outstanding this period, in the order the
 * user arranged them. Shared with the section header so it can summarise them.
 */
export function usePendingRoutines(): PendingRoutine[] {
  const tasks = useTasks((s) => s.tasks);
  const routines = useTasks((s) => s.routines);
  const today = todayKey();
  return [...routines]
    .sort((a, b) => a.order - b.order)
    .map((routine) => ({
      routine,
      steps: tasks
        .filter((t) => t.routineId === routine.id && t.scheduledDate === today)
        .sort((a, b) => a.order - b.order),
    }))
    .filter(({ steps }) => steps.length > 0 && steps.some((t) => t.status !== 'done'));
}

const MAX_ROUTINE_PERIODS = 60;

/**
 * Bank one period's outcome. Never overwrites an existing record — a period that
 * was explicitly skipped keeps the counts it had at the moment it was skipped.
 */
function recordPeriod(
  history: RoutineHistory,
  routineId: string,
  periodKey: string,
  steps: Task[],
  skipped = false
): RoutineHistory {
  const existing = history[routineId] ?? {};
  if (existing[periodKey] || steps.length === 0) return history;
  const next = {
    ...existing,
    [periodKey]: {
      done: steps.filter((t) => t.status === 'done').length,
      total: steps.length,
      trackedMs: steps.reduce((a, t) => a + (t.trackedMs ?? 0), 0),
      ...(skipped ? { skipped: true } : {}),
    },
  };
  const keys = Object.keys(next);
  if (keys.length > MAX_ROUTINE_PERIODS) {
    const kept = keys
      .sort((a, b) => {
        const na = a.startsWith('custom-') ? Number(a.slice(7)) : NaN;
        const nb = b.startsWith('custom-') ? Number(b.slice(7)) : NaN;
        return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
      })
      .slice(-MAX_ROUTINE_PERIODS);
    return { ...history, [routineId]: Object.fromEntries(kept.map((k) => [k, next[k]])) };
  }
  return { ...history, [routineId]: next };
}

export const useTasks = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [],
      routines: [],
      routineHistory: {},

      addTask: (title, scheduledDate) =>
        set((s) => ({
          tasks: [
            ...s.tasks,
            {
              id: crypto.randomUUID(),
              title,
              status: 'todo' as TaskStatus,
              createdAt: Date.now(),
              scheduledDate,
              order: s.tasks.filter((t) => t.scheduledDate === scheduledDate).length,
              subtasks: [],
              trackedMs: 0,
            },
          ],
        })),

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      // Puts a deleted task back exactly as it was — `order` is preserved, so it
      // returns to its old position in the list.
      restoreTask: (task) =>
        set((s) =>
          s.tasks.some((t) => t.id === task.id) ? s : { tasks: [...s.tasks, task] }
        ),

      moveToTomorrow: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, scheduledDate: tomorrowKey() } : t
          ),
        })),

      reorderTasks: (orderedIds) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            const newOrder = orderedIds.indexOf(t.id);
            return newOrder >= 0 ? { ...t, order: newOrder } : t;
          }),
        })),

      addSubtask: (taskId, title) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: [
                    ...(t.subtasks ?? []),
                    { id: crypto.randomUUID(), title, done: false } as SubTask,
                  ],
                }
              : t
          ),
        })),

      toggleSubtask: (taskId, subtaskId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: (t.subtasks ?? []).map((st) =>
                    st.id === subtaskId ? { ...st, done: !st.done } : st
                  ),
                }
              : t
          ),
        })),

      deleteSubtask: (taskId, subtaskId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: (t.subtasks ?? []).filter((st) => st.id !== subtaskId) }
              : t
          ),
        })),

      editSubtask: (taskId, subtaskId, title) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: (t.subtasks ?? []).map((st) =>
                    st.id === subtaskId ? { ...st, title } : st
                  ),
                }
              : t
          ),
        })),

      rolloverPastTasks: () => {
        const today = todayKey();
        const carried = get()
          .tasks.filter(
            (t) => t.scheduledDate < today && t.status !== 'done' && !t.routineId
          )
          .map((t) => t.id);
        if (carried.length === 0) return [];
        set((s) => ({
          tasks: s.tasks.map((t) =>
            carried.includes(t.id) ? { ...t, scheduledDate: today } : t
          ),
        }));
        return carried;
      },

      adjustTrackedMs: (id, deltaMs) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, trackedMs: Math.max(0, (t.trackedMs ?? 0) + deltaMs) }
              : t
          ),
        })),

      // ── Routines ──────────────────────────────────────────────────────────

      addRoutine: (title, period, periodDays) =>
        set((s) => ({
          routines: [
            ...s.routines,
            {
              id: crypto.randomUUID(),
              title,
              period,
              periodDays,
              items: [],
              createdAt: Date.now(),
              order: s.routines.length,
            },
          ],
        })),

      updateRoutine: (id, patch) =>
        set((s) => ({
          routines: s.routines.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      // Removing a routine leaves the tasks it already spawned alone — they are
      // real tasks now, and silently deleting today's work would be a surprise.
      deleteRoutine: (id) =>
        set((s) => {
          const history = { ...s.routineHistory };
          delete history[id];
          return {
            routines: s.routines.filter((r) => r.id !== id),
            routineHistory: history,
            tasks: s.tasks.map((t) =>
              t.routineId === id ? { ...t, routineId: undefined, routinePeriodKey: undefined } : t
            ),
          };
        }),

      reorderRoutines: (orderedIds) =>
        set((s) => ({
          routines: s.routines.map((r) => {
            const i = orderedIds.indexOf(r.id);
            return i >= 0 ? { ...r, order: i } : r;
          }),
        })),

      addRoutineItem: (routineId, title) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId
              ? { ...r, items: [...r.items, { id: crypto.randomUUID(), title } as RoutineItem] }
              : r
          ),
        })),

      updateRoutineItem: (routineId, itemId, title) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId
              ? { ...r, items: r.items.map((i) => (i.id === itemId ? { ...i, title } : i)) }
              : r
          ),
        })),

      deleteRoutineItem: (routineId, itemId) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId ? { ...r, items: r.items.filter((i) => i.id !== itemId) } : r
          ),
        })),

      reorderRoutineItems: (routineId, orderedIds) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  items: [...r.items].sort(
                    (a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)
                  ),
                }
              : r
          ),
        })),

      // Skipping has to remove the steps it already put in today's list —
      // otherwise nothing visibly happens. Completed steps stay: they were done.
      snoozeRoutine: (id) =>
        set((s) => {
          const routine = s.routines.find((r) => r.id === id);
          if (!routine) return s;
          const key = routine.lastSpawnKey ?? getPeriodKey(routine.period, routine.periodDays, routine.createdAt);
          const steps = s.tasks.filter(
            (t) => t.routineId === id && (t.routinePeriodKey ?? routine.lastSpawnKey) === key
          );
          return {
            // lastSpawnKey is kept so the period still closes cleanly; snoozedUntil
            // is what stops it coming back before its next turn.
            routines: s.routines.map((r) =>
              r.id === id ? { ...r, snoozedUntil: tomorrowKey() } : r
            ),
            tasks: s.tasks.filter((t) => !(steps.includes(t) && t.status !== 'done')),
            routineHistory: recordPeriod(s.routineHistory, id, key, steps, true),
          };
        }),

      /**
       * Put today's routine items into today's list. Runs on load and at
       * midnight. `lastSpawnKey` makes it idempotent: a routine spawns once per
       * period, so reopening the app mid-day never duplicates anything.
       */
      spawnDueRoutines: () => {
        const today = todayKey();
        const { routines, tasks, routineHistory } = get();
        const spawned: Task[] = [];
        const retired = new Set<string>();
        let history = routineHistory;

        const updated = routines.map((r) => {
          const key = getPeriodKey(r.period, r.periodDays, r.createdAt);
          if (r.lastSpawnKey === key) return r;

          // The previous period has closed: bank what it achieved, then clear its
          // steps out so they cannot be confused with the new period's.
          if (r.lastSpawnKey) {
            const old = tasks.filter(
              (t) => t.routineId === r.id && (t.routinePeriodKey ?? r.lastSpawnKey) === r.lastSpawnKey
            );
            history = recordPeriod(history, r.id, r.lastSpawnKey, old);
            old.forEach((t) => retired.add(t.id));
          }

          if (r.snoozedUntil && today < r.snoozedUntil) return r;

          let order = tasks.filter((t) => t.scheduledDate === today).length + spawned.length;
          r.items.forEach((item) => {
            spawned.push({
              id: crypto.randomUUID(),
              title: item.title,
              status: 'todo' as TaskStatus,
              createdAt: Date.now(),
              scheduledDate: today,
              order: order++,
              subtasks: [],
              trackedMs: 0,
              routineId: r.id,
              routinePeriodKey: key,
            });
          });
          return { ...r, lastSpawnKey: key, snoozedUntil: undefined };
        });

        const unchanged =
          spawned.length === 0 && retired.size === 0 && updated.every((r, i) => r === routines[i]);
        if (unchanged) return;

        set((s) => ({
          routines: updated,
          routineHistory: history,
          tasks: [...s.tasks.filter((t) => !retired.has(t.id)), ...spawned],
        }));
      },
    }),
    {
      name: 'tt-tasks',
      version: 6,
      migrate: (persisted: unknown, version: number) => {
        let state = persisted as PersistedTasksState;
        if (version < 3) {
          return {
            tasks: (state.tasks ?? []).map((t, i) => ({
              id: t.id,
              title: t.title,
              status: (t.status === 'in-progress' || t.status === 'parked') ? 'todo' : (t.status ?? 'todo'),
              createdAt: t.createdAt ?? Date.now(),
              scheduledDate: t.scheduledDate ?? todayKey(),
              order: t.order ?? i,
              subtasks: t.subtasks ?? [],
              trackedMs: 0,
            })),
          };
        }
        if (version < 4) {
          state = {
            tasks: (state.tasks ?? []).map((t) => ({
              ...t,
              trackedMs: t.trackedMs ?? 0,
            })),
          };
        }
        if (version < 5) {
          state = { ...state, routines: migrateChecklists(state.tasks ?? []) };
        }
        if (version < 6) {
          return { ...state, routineHistory: {} };
        }
        return state;
      },
    }
  )
);
