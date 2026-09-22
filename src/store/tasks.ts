import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SubTask, Task, TaskStatus, TimeEntry } from '../types';
import { todayKey, tomorrowKey } from '../utils/thirdTime';
import { useSettings } from './settings';
import { reattributeActiveTask, resyncAggregates } from './sessionBridge';
import { readPersistedLedger } from './persistedLedger';

/**
 * Legacy routine data. Routines became habits, and habits are gone too now —
 * nothing reads this any more. It stays in `tt-tasks` untouched anyway, on the
 * same principle that kept it around for habits to seed from: a migration
 * never deletes user data just because the feature that made sense of it did.
 */
type LegacyRoutines = unknown[];
type LegacyRoutineHistory = Record<string, unknown>;

interface TasksState {
  tasks: Task[];
  /** @deprecated kept only so the persisted key survives */
  routines: LegacyRoutines;
  /** @deprecated */
  routineHistory: LegacyRoutineHistory;
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
  /** Ledger credit from a closing entry. The session store's to call. */
  adjustTrackedMs: (id: string, deltaMs: number) => void;
  /**
   * A hand correction ("I forgot to track 20 minutes"). There's no entry
   * behind it, so it lands in `carriedMs` where a re-sum can't undo it.
   */
  adjustManualMs: (id: string, deltaMs: number) => void;
  setTaskProject: (id: string, projectId?: string) => void;
  /** A deleted project untags itself from every task — the tasks stay, the tag doesn't. */
  clearTaskProject: (projectId: string) => void;
  /**
   * Re-sum every task's `trackedMs` from the ledger. Same rationale as
   * `useProjects.recomputeFrom`: once entries are editable, a delta patched
   * onto `trackedMs` at commit time is only ever right until the entry that
   * funded it is edited or removed — after that it's a number nothing will
   * ever correct on its own.
   */
  recomputeFrom: (entries: TimeEntry[]) => void;
  /** Entries aging out of history move their time into `carriedMs`. */
  carryForward: (entries: TimeEntry[]) => void;
}

/** Work time the ledger credits to each task. */
function ledgerMsByTask(entries: TimeEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'work' || !e.taskId) continue;
    out.set(e.taskId, (out.get(e.taskId) ?? 0) + Math.max(0, e.endedAt - e.startedAt));
  }
  return out;
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
  routines?: LegacyRoutines;
  routineHistory?: LegacyRoutineHistory;
}

/**
 * Checklists used to be their own store, then routines. The old `tt-checklists`
 * key is left in place; this fills `routines` for a store old enough never to
 * have run the v5 migration, so that legacy data still lands somewhere.
 */
function migrateChecklists(existingTasks: PersistedTask[]): LegacyRoutines {
  try {
    const raw = localStorage.getItem('tt-checklists');
    if (!raw) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lists: any[] = JSON.parse(raw)?.state?.checklists ?? [];
    const today = todayKey(useSettings.getState().dayEndHour);
    let order = existingTasks.filter((t) => t.scheduledDate === today).length;
    const spawned: Task[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routines = lists.map((c: any, i: number) => {
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
        period: c.period ?? 'daily',
        periodDays: c.periodDays,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (c.items ?? []).map((item: any) => ({ id: item.id, title: item.title })),
        createdAt: c.createdAt ?? Date.now(),
        order: c.order ?? i,
      };
    });

    existingTasks.push(...spawned);
    return routines;
  } catch {
    return [];
  }
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

      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      // Puts a deleted task back exactly as it was — `order` is preserved, so it
      // returns to its old position in the list.
      restoreTask: (task) =>
        set((s) =>
          s.tasks.some((t) => t.id === task.id) ? s : { tasks: [...s.tasks, task] }
        ),

      moveToTomorrow: (id) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, scheduledDate: tomorrowKey(dayEndHour) } : t
          ),
        }));
      },

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
        const today = todayKey(useSettings.getState().dayEndHour);
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

      adjustManualMs: (id, deltaMs) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            const trackedMs = Math.max(0, (t.trackedMs ?? 0) + deltaMs);
            // Only what actually moved `trackedMs` is carried, so a subtraction
            // clamped at zero can't leave a hidden debt behind.
            return { ...t, trackedMs, carriedMs: (t.carriedMs ?? 0) + trackedMs - (t.trackedMs ?? 0) };
          }),
        })),

      setTaskProject: (id, projectId) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, projectId } : t)),
        }));
        // A task's time is filed under whatever project the task belongs to,
        // so retagging it moves all of that time at once. The stint running
        // right now has to be closed under the old project and reopened under
        // the new one before another second accrues to the wrong one; the
        // entries already in the ledger follow from the re-sum, which reads
        // each entry's project through its task.
        reattributeActiveTask(id);
        resyncAggregates();
      },

      clearTaskProject: (projectId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.projectId === projectId ? { ...t, projectId: undefined } : t)),
        })),

      recomputeFrom: (entries) => {
        const byTask = ledgerMsByTask(entries);
        set((s) => ({
          tasks: s.tasks.map((t) => ({
            ...t,
            trackedMs: Math.max(0, (t.carriedMs ?? 0) + (byTask.get(t.id) ?? 0)),
          })),
        }));
      },

      carryForward: (entries) => {
        const byTask = ledgerMsByTask(entries);
        if (byTask.size === 0) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            byTask.has(t.id) ? { ...t, carriedMs: (t.carriedMs ?? 0) + byTask.get(t.id)! } : t
          ),
        }));
      },
    }),
    {
      name: 'tt-tasks',
      version: 8,
      migrate: (persisted: unknown, version: number) => migrateTtTasks(persisted, version),
    }
  )
);

/**
 * The store's `migrate`, exported so the chain is what tests exercise. `ledger`
 * defaults to what `tt-session` holds on disk.
 */
export function migrateTtTasks(
  persisted: unknown,
  version: number,
  ledger: TimeEntry[] = readPersistedLedger()
) {
  let state = persisted as PersistedTasksState;
  if (version < 3) {
    // Falls through: every later leg still applies to a store this old.
    state = {
      tasks: (state.tasks ?? []).map((t, i) => ({
        id: t.id,
        title: t.title,
        status:
          t.status === 'in-progress' || t.status === 'parked'
            ? 'todo'
            : t.status ?? 'todo',
        createdAt: t.createdAt ?? Date.now(),
        scheduledDate: t.scheduledDate ?? todayKey(useSettings.getState().dayEndHour),
        order: t.order ?? i,
        subtasks: t.subtasks ?? [],
        trackedMs: 0,
      })),
    };
  }
  if (version < 4) {
    state = {
      tasks: (state.tasks ?? []).map((t) => ({ ...t, trackedMs: t.trackedMs ?? 0 })),
    };
  }
  if (version < 5) {
    state = { ...state, routines: migrateChecklists(state.tasks ?? []) };
  }
  if (version < 6) {
    state = { ...state, routineHistory: {} };
  }
  if (version < 7) {
    // `projectId` is optional, and its absence already means "no
    // project" — there is nothing on an existing task to backfill. The
    // bump exists only to declare the field as part of the shape.
    state = { ...state };
  }
  if (version < 8) {
    // Whatever a task has tracked beyond what the ledger holds for it —
    // everything from before entries named tasks, plus any manual
    // adjustments — would be zeroed by the next re-sum. Carry it.
    const byTask = ledgerMsByTask(ledger);
    state = {
      ...state,
      tasks: (state.tasks ?? []).map((t) => ({
        ...t,
        carriedMs: Math.max(0, (t.trackedMs ?? 0) - (byTask.get(t.id ?? '') ?? 0)),
      })),
    };
  }
  return state;
}
