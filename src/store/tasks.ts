import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskStatus, SubTask, Routine, RoutineItem, GoalPeriod } from '../types';
import { todayKey, tomorrowKey } from '../utils/thirdTime';
import { getPeriodKey } from '../utils/goalPeriod';

interface TasksState {
  tasks: Task[];
  routines: Routine[];
  addTask: (title: string, scheduledDate: string, estimateMin?: number) => void;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;
  restoreTask: (task: Task) => void;
  moveToTomorrow: (id: string) => void;
  prioritizeTask: (id: string) => void;
  reorderTasks: (orderedIds: string[]) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  editSubtask: (taskId: string, subtaskId: string, title: string) => void;
  rolloverPastTasks: () => void;
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
 * Checklists used to be their own store. They were the same idea as a recurring
 * task, so they become routines here. The old `tt-checklists` key is left in
 * place rather than deleted, so nothing is lost if this needs unpicking.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateChecklists(existingTasks: any[]): Routine[] {
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

export const useTasks = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [],
      routines: [],

      addTask: (title, scheduledDate, estimateMin) =>
        set((s) => ({
          tasks: [
            ...s.tasks,
            {
              id: crypto.randomUUID(),
              title,
              estimateMin,
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

      // Bring a task to the top of today and restart its staleness clock, so the
      // stale banner stops nagging about something the user has just acted on.
      prioritizeTask: (id) =>
        set((s) => {
          const today = todayKey();
          const topOrder = Math.min(
            0,
            ...s.tasks.filter((t) => t.scheduledDate === today).map((t) => t.order)
          );
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? { ...t, scheduledDate: today, order: topOrder - 1, acknowledgedAt: Date.now() }
                : t
            ),
          };
        }),

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
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.scheduledDate < today && t.status !== 'done'
              ? { ...t, scheduledDate: today }
              : t
          ),
        }));
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
        set((s) => ({
          routines: s.routines.filter((r) => r.id !== id),
          tasks: s.tasks.map((t) => (t.routineId === id ? { ...t, routineId: undefined } : t)),
        })),

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

      snoozeRoutine: (id) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === id ? { ...r, snoozedUntil: tomorrowKey(), lastSpawnKey: undefined } : r
          ),
        })),

      /**
       * Put today's routine items into today's list. Runs on load and at
       * midnight. `lastSpawnKey` makes it idempotent: a routine spawns once per
       * period, so reopening the app mid-day never duplicates anything.
       */
      spawnDueRoutines: () => {
        const today = todayKey();
        const { routines, tasks } = get();
        const spawned: Task[] = [];
        const updated = routines.map((r) => {
          const key = getPeriodKey(r.period, r.periodDays, r.createdAt);
          if (r.lastSpawnKey === key) return r;
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
            });
          });
          return { ...r, lastSpawnKey: key, snoozedUntil: undefined };
        });
        if (spawned.length === 0 && updated.every((r, i) => r === routines[i])) return;
        set((s) => ({ routines: updated, tasks: [...s.tasks, ...spawned] }));
      },
    }),
    {
      name: 'tt-tasks',
      version: 5,
      migrate: (persisted: unknown, version: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let state = persisted as { tasks?: any[] };
        if (version < 3) {
          return {
            tasks: (state.tasks ?? []).map((t: any, i: number) => ({
              id: t.id,
              title: t.title,
              estimateMin: t.estimateMin,
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
            tasks: (state.tasks ?? []).map((t: any) => ({
              ...t,
              trackedMs: t.trackedMs ?? 0,
            })),
          };
        }
        if (version < 5) {
          return { ...state, routines: migrateChecklists(state.tasks ?? []) };
        }
        return state;
      },
    }
  )
);
