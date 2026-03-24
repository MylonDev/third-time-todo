import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskStatus, SubTask } from '../types';
import { todayKey, tomorrowKey } from '../utils/thirdTime';

interface TasksState {
  tasks: Task[];
  addTask: (title: string, scheduledDate: string, estimateMin?: number) => void;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;
  moveToTomorrow: (id: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  editSubtask: (taskId: string, subtaskId: string, title: string) => void;
}

export const useTasks = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [],

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
              order: s.tasks.length,
              subtasks: [],
            },
          ],
        })),

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      moveToTomorrow: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, scheduledDate: tomorrowKey() } : t
          ),
        })),

      reorderTasks: (activeId, overId) => {
        const { tasks } = get();
        const activeTask = tasks.find((t) => t.id === activeId);
        const overTask = tasks.find((t) => t.id === overId);
        if (!activeTask || !overTask) return;
        const activeOrder = activeTask.order;
        const overOrder = overTask.order;
        set({
          tasks: tasks.map((t) => {
            if (t.id === activeId) return { ...t, order: overOrder };
            if (t.id === overId) return { ...t, order: activeOrder };
            return t;
          }),
        });
      },

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
    }),
    {
      name: 'tt-tasks',
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persisted as { tasks?: any[] };
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
            })),
          };
        }
        return state;
      },
    }
  )
);
