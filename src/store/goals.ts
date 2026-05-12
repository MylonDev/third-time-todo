import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal, GoalType, GoalPeriod } from '../types';

interface AddGoalParams {
  title: string;
  type: GoalType;
  period: GoalPeriod;
  periodDays?: number;
  target: number;
  deadline?: string;
}

interface GoalsState {
  goals: Goal[];
  addGoal: (params: AddGoalParams) => void;
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id' | 'createdAt'>>) => void;
  deleteGoal: (id: string) => void;
  reorderGoals: (activeId: string, overId: string) => void;
  commitTime: (goalId: string, periodKey: string, ms: number) => void;
  adjustProgress: (goalId: string, periodKey: string, delta: number) => void;
}

export const useGoals = create<GoalsState>()(
  persist(
    (set, get) => ({
      goals: [],

      addGoal: (params) =>
        set((s) => ({
          goals: [
            ...s.goals,
            {
              id: crypto.randomUUID(),
              title: params.title,
              type: params.type,
              period: params.period,
              periodDays: params.periodDays,
              target: params.target,
              deadline: params.deadline,
              createdAt: Date.now(),
              order: s.goals.length,
              progress: {},
            },
          ],
        })),

      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),

      deleteGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      reorderGoals: (activeId, overId) => {
        const { goals } = get();
        const active = goals.find((g) => g.id === activeId);
        const over = goals.find((g) => g.id === overId);
        if (!active || !over) return;
        const activeOrder = active.order;
        const overOrder = over.order;
        set({
          goals: goals.map((g) => {
            if (g.id === activeId) return { ...g, order: overOrder };
            if (g.id === overId) return { ...g, order: activeOrder };
            return g;
          }),
        });
      },

      commitTime: (goalId, periodKey, ms) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? { ...g, progress: { ...g.progress, [periodKey]: (g.progress[periodKey] ?? 0) + ms } }
              : g
          ),
        })),

      adjustProgress: (goalId, periodKey, delta) =>
        set((s) => ({
          goals: s.goals.map((g) => {
            if (g.id !== goalId) return g;
            const current = g.progress[periodKey] ?? 0;
            const next = g.type === 'boolean'
              ? Math.max(0, Math.min(1, current + delta))
              : Math.max(0, current + delta);
            return { ...g, progress: { ...g.progress, [periodKey]: next } };
          }),
        })),
    }),
    {
      name: 'tt-goals',
      version: 1,
    }
  )
);
