import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskStatus, SubTask } from '../types';
import { todayKey, tomorrowKey } from '../utils/thirdTime';

/**
 * Legacy routine data. Routines became habits (`store/habits.ts`); this data is
 * left in `tt-tasks` untouched so nothing is lost and `habits` can seed from it.
 */
type LegacyRoutines = unknown[];
type LegacyRoutineHistory = Record<string, unknown>;

interface TasksState {
  tasks: Task[];
  /** @deprecated kept only so the persisted key survives — see habits store */
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
  adjustTrackedMs: (id: string, deltaMs: number) => void;
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
 * have run the v5 migration, so the habits store can still seed from it.
 */
function migrateChecklists(existingTasks: PersistedTask[]): LegacyRoutines {
  try {
    const raw = localStorage.getItem('tt-checklists');
    if (!raw) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lists: any[] = JSON.parse(raw)?.state?.checklists ?? [];
    const today = todayKey();
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
              status:
                t.status === 'in-progress' || t.status === 'parked'
                  ? 'todo'
                  : t.status ?? 'todo',
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
            tasks: (state.tasks ?? []).map((t) => ({ ...t, trackedMs: t.trackedMs ?? 0 })),
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
