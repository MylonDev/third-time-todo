import type { PeriodTarget, Project } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function sumProgress(progress: Record<string, number> = {}): number {
  return Object.values(progress).reduce((a, b) => a + b, 0);
}

/**
 * `tt-goals` v1 → v2, carried over verbatim from the old `goals.ts`. The v1
 * shape (`{ type, target, period }`, no `outcome`/`effort`) predates the
 * outcome/effort split, so it has to be lifted into that shape before
 * anything later in the chain can read it.
 */
function migrateV1Goal(g: any): any {
  const period = g.period ?? 'daily';
  const periodDays = g.periodDays;
  let outcome: any;
  let effort: any;

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
    // `g.total` may be absent on a blob that never passed through the v2→v3
    // "seed total" leg (e.g. a v3 fixture built by hand) — fall back to summing
    // `progress` rather than losing the cumulative figure outright. Only under
    // the same time-flavoured gate: a count goal's summed progress is
    // kilometres, not milliseconds, and must still land at 0.
    total: { time: timeFlavoured ? (g.total ?? sumProgress(g.progress)) : 0 },
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * `tt-goals` v3 → v4: goals become projects. `milestones`, `evolvesFromId`,
 * `doneWhen`, `outcome` and `completedAt` are left in the persisted blob,
 * unread — repo convention is to never delete a persisted field. Fixtures
 * passed in here are expected to already be in the v3 (outcome/effort/
 * progress/total) shape; a raw v1 or v2 blob needs `migrateGoalsChain` below,
 * which runs the earlier legs first.
 */
export function migrateGoalsV3(persisted: unknown): { projects: Project[] } {
  const s = (persisted ?? {}) as { goals?: unknown[] };
  return { projects: ((s.goals ?? []) as any[]).map(migrateGoal) };
}

/**
 * The full `tt-goals` version chain, v1/v2/v3 → v4, run in order from
 * whichever version the persisted blob is actually at. Each leg has to run
 * before the next reads its output — skipping straight to `migrateGoalsV3`
 * for an old store silently drops every hour a v1 goal ever logged, because
 * a v1 blob has no `outcome` for the time-flavoured check to key off of.
 */
export function migrateGoalsChain(persisted: unknown, version: number): { projects: Project[] } {
  let s = (persisted ?? {}) as { goals?: any[] };
  if (version < 2) {
    s = { goals: (s.goals ?? []).map(migrateV1Goal) };
  }
  if (version < 3) {
    // `total` becomes the authoritative cumulative figure; seed it from
    // whatever `progress` buckets currently hold.
    s = {
      goals: (s.goals ?? []).map((g) => ({
        ...g,
        total: g.total ?? sumProgress(g.progress),
      })),
    };
  }
  return migrateGoalsV3(s);
}
