import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal, GoalMilestone, GoalOutcome, EffortTarget } from '../types';
import { effortPeriodKey, prunePeriods } from '../utils/goalPeriod';
import { todayKey } from '../utils/thirdTime';
import { useSettings } from './settings';

interface AddGoalParams {
  title: string;
  outcome: GoalOutcome;
  milestones?: { label: string }[];
  effort?: EffortTarget;
  deadline?: string;
  doneWhen?: string;
  evolvesFromId?: string;
}

interface GoalsState {
  goals: Goal[];
  addGoal: (params: AddGoalParams) => string;
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id' | 'createdAt' | 'progress' | 'total'>>) => void;
  deleteGoal: (id: string) => void;
  reorderGoals: (orderedIds: string[]) => void;
  archiveGoal: (id: string) => void;
  completeGoal: (id: string) => void;

  /** The period key a bit of progress belongs in right now. */
  currentPeriodKey: (goalId: string) => string;
  /** Add focused session time (ms) to a goal's current period. Called by the session store. */
  commitTime: (goalId: string, ms: number) => void;
  /** Add to a count goal's current period (positive or negative). */
  logCount: (goalId: string, delta: number) => void;

  addMilestone: (goalId: string, label: string) => void;
  updateMilestone: (goalId: string, milestoneId: string, patch: Partial<Omit<GoalMilestone, 'id'>>) => void;
  deleteMilestone: (goalId: string, milestoneId: string) => void;
  toggleMilestone: (goalId: string, milestoneId: string) => void;
}

function periodKeyFor(goal: Goal, dayEndHour: number): string {
  return goal.effort ? effortPeriodKey(goal.effort, goal.createdAt, dayEndHour) : todayKey(dayEndHour);
}

function sumProgress(progress: Record<string, number> = {}): number {
  return Object.values(progress).reduce((a, b) => a + b, 0);
}

// ── migrations ────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateV1Goal(g: any): Goal {
  const period = g.period ?? 'daily';
  const periodDays = g.periodDays;
  let outcome: GoalOutcome;
  let effort: EffortTarget | undefined;

  if (g.type === 'time') {
    outcome = { kind: 'time', targetHours: (g.target ?? 0) / 3_600_000 };
    if (g.target) effort = { metric: 'time', amount: g.target, period, periodDays };
  } else if (g.type === 'counter') {
    outcome = { kind: 'count', unit: 'times', target: g.target ?? 1 };
    effort = { metric: 'count', amount: g.target ?? 1, period, periodDays };
  } else {
    // boolean — "do it once per period"
    outcome = { kind: 'open' };
    effort = { metric: 'count', amount: 1, period, periodDays };
  }

  return {
    id: g.id ?? crypto.randomUUID(),
    title: g.title ?? 'Goal',
    outcome,
    milestones: [],
    effort,
    doneWhen: undefined,
    createdAt: g.createdAt ?? Date.now(),
    order: g.order ?? 0,
    progress: g.progress ?? {},
    total: sumProgress(g.progress),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const useGoals = create<GoalsState>()(
  persist(
    (set, get) => ({
      goals: [],

      addGoal: (params) => {
        const id = crypto.randomUUID();
        set((s) => ({
          goals: [
            ...s.goals,
            {
              id,
              title: params.title,
              outcome: params.outcome,
              milestones: (params.milestones ?? []).map((m) => ({
                id: crypto.randomUUID(),
                label: m.label,
              })),
              effort: params.effort,
              deadline: params.deadline,
              doneWhen: params.doneWhen,
              evolvesFromId: params.evolvesFromId,
              createdAt: Date.now(),
              order: s.goals.length,
              progress: {},
              total: 0,
            },
          ],
        }));
        return id;
      },

      updateGoal: (id, patch) =>
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      reorderGoals: (orderedIds) =>
        set((s) => ({
          goals: s.goals.map((g) => {
            const i = orderedIds.indexOf(g.id);
            return i >= 0 ? { ...g, order: i } : g;
          }),
        })),

      archiveGoal: (id) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, archivedAt: Date.now() } : g)),
        })),

      completeGoal: (id) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id ? { ...g, completedAt: Date.now(), archivedAt: g.archivedAt ?? Date.now() } : g
          ),
        })),

      currentPeriodKey: (goalId) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        const goal = get().goals.find((g) => g.id === goalId);
        return goal ? periodKeyFor(goal, dayEndHour) : todayKey(dayEndHour);
      },

      commitTime: (goalId, ms) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        set((s) => ({
          goals: s.goals.map((g) => {
            if (g.id !== goalId || ms <= 0) return g;
            const key = periodKeyFor(g, dayEndHour);
            return {
              ...g,
              progress: prunePeriods({ ...g.progress, [key]: (g.progress[key] ?? 0) + ms }),
              total: g.total + ms,
            };
          }),
        }));
      },

      logCount: (goalId, delta) => {
        const dayEndHour = useSettings.getState().dayEndHour;
        set((s) => ({
          goals: s.goals.map((g) => {
            if (g.id !== goalId) return g;
            const key = periodKeyFor(g, dayEndHour);
            const prev = g.progress[key] ?? 0;
            const next = Math.max(0, prev + delta);
            return {
              ...g,
              progress: prunePeriods({ ...g.progress, [key]: next }),
              total: Math.max(0, g.total + (next - prev)),
            };
          }),
        }));
      },

      addMilestone: (goalId, label) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? { ...g, milestones: [...g.milestones, { id: crypto.randomUUID(), label }] }
              : g
          ),
        })),

      updateMilestone: (goalId, milestoneId, patch) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: g.milestones.map((m) =>
                    m.id === milestoneId ? { ...m, ...patch } : m
                  ),
                }
              : g
          ),
        })),

      deleteMilestone: (goalId, milestoneId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? { ...g, milestones: g.milestones.filter((m) => m.id !== milestoneId) }
              : g
          ),
        })),

      toggleMilestone: (goalId, milestoneId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: g.milestones.map((m) =>
                    m.id === milestoneId
                      ? { ...m, doneAt: m.doneAt ? undefined : Date.now() }
                      : m
                  ),
                }
              : g
          ),
        })),
    }),
    {
      name: 'tt-goals',
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        let s = persisted as { goals?: unknown[] };
        if (version < 2) {
          s = { goals: (s.goals ?? []).map(migrateV1Goal) };
        }
        if (version < 3) {
          // `total` becomes the authoritative cumulative figure; seed it from
          // whatever `progress` buckets currently hold.
          return {
            goals: ((s.goals ?? []) as Goal[]).map((g) => ({
              ...g,
              total: g.total ?? sumProgress(g.progress),
            })),
          };
        }
        return s as { goals: Goal[] };
      },
    }
  )
);
