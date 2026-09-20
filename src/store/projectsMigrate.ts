import type { PeriodTarget, Project } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Whether an old goal's numbers were milliseconds. A count goal's `progress`
 * and `total` are kilometres or book counts — reading them into `progress.time`
 * would silently invent hours that were never earned.
 */
function wasTimeFlavoured(g: any): boolean {
  const kind = g.outcome?.kind;
  return (kind === 'time' || kind === 'open') && g.effort?.metric !== 'count';
}

function migrateGoal(g: any): Project {
  const timeFlavoured = wasTimeFlavoured(g);

  const target: PeriodTarget | undefined =
    g.effort?.metric === 'time'
      ? {
          metric: 'time',
          amount: g.effort.amount,
          period: g.effort.period,
          periodDays: g.effort.periodDays,
        }
      : undefined;

  return {
    id: g.id,
    name: g.title,
    createdAt: g.createdAt,
    order: g.order,
    deadline: g.deadline,
    archivedAt: g.archivedAt,
    target,
    progress: { time: timeFlavoured ? { ...(g.progress ?? {}) } : {} },
    total: { time: timeFlavoured ? (g.total ?? 0) : 0 },
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * `tt-goals` v2 → v3: goals become projects. `milestones`, `evolvesFromId`,
 * `doneWhen`, `outcome` and `completedAt` are left in the persisted blob,
 * unread — repo convention is to never delete a persisted field.
 */
export function migrateGoalsV3(persisted: unknown): { projects: Project[] } {
  const s = (persisted ?? {}) as { goals?: unknown[] };
  return { projects: ((s.goals ?? []) as any[]).map(migrateGoal) };
}
