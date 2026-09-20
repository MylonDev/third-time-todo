import { describe, expect, it } from 'vitest';
import { migrateGoalsV3 } from './projectsMigrate';
import { migrateTtGoals } from './projects';

const HOUR = 3_600_000;

const timeGoal = {
  id: 'g1', title: 'Learn to code', order: 0, createdAt: 1,
  outcome: { kind: 'time', targetHours: 100 },
  effort: { metric: 'time', amount: 10 * HOUR, period: 'weekly' },
  progress: { '2026-09-14': 4 * HOUR }, total: 4 * HOUR,
  milestones: [{ id: 'm1', label: 'first commit' }],
  deadline: '2026-12-31',
};

const countGoal = {
  id: 'g2', title: 'Ride 1,000 km', order: 1, createdAt: 2,
  outcome: { kind: 'count', unit: 'km', target: 1000 },
  effort: { metric: 'count', amount: 50, period: 'weekly' },
  progress: { '2026-09-14': 120 }, total: 120, milestones: [],
};

const openGoal = {
  id: 'g3', title: 'Read more', order: 2, createdAt: 3,
  outcome: { kind: 'open' }, progress: { '2026-09-14': 2 * HOUR }, total: 2 * HOUR, milestones: [],
};

describe('migrateGoalsV3', () => {
  it('carries a time goal\'s progress under the time metric', () => {
    const [p] = migrateGoalsV3({ goals: [timeGoal] }).projects;
    expect(p.name).toBe('Learn to code');
    expect(p.progress.time['2026-09-14']).toBe(4 * HOUR);
    expect(p.total.time).toBe(4 * HOUR);
  });

  it('keeps a time effort target and the deadline', () => {
    const [p] = migrateGoalsV3({ goals: [timeGoal] }).projects;
    expect(p.target).toEqual({ metric: 'time', amount: 10 * HOUR, period: 'weekly' });
    expect(p.deadline).toBe('2026-12-31');
  });

  it('drops milestones', () => {
    const [p] = migrateGoalsV3({ goals: [timeGoal] }).projects;
    expect(p).not.toHaveProperty('milestones');
  });

  it('does not read a count goal\'s numbers as milliseconds', () => {
    const [p] = migrateGoalsV3({ goals: [countGoal] }).projects;
    expect(p.progress.time).toEqual({});
    expect(p.total.time).toBe(0);
    expect(p.target).toBeUndefined();
  });

  it('keeps an open goal\'s banked time', () => {
    const [p] = migrateGoalsV3({ goals: [openGoal] }).projects;
    expect(p.total.time).toBe(2 * HOUR);
  });

  it('preserves order and survives an empty store', () => {
    const { projects } = migrateGoalsV3({ goals: [timeGoal, countGoal, openGoal] });
    expect(projects.map((p) => p.id)).toEqual(['g1', 'g2', 'g3']);
    expect(migrateGoalsV3({}).projects).toEqual([]);
  });

  it('derives total.time by summing progress when total is absent, for a time-flavoured goal', () => {
    const noTotal = {
      id: 'g4', title: 'No total field', order: 3, createdAt: 4,
      outcome: { kind: 'time', targetHours: 10 },
      progress: { '2026-09-10': 2 * HOUR, '2026-09-11': 1 * HOUR },
      milestones: [],
    };
    const [p] = migrateGoalsV3({ goals: [noTotal] }).projects;
    expect(p.total.time).toBe(3 * HOUR);
  });

  it('does not sum a count goal\'s progress into total.time when total is absent', () => {
    const noTotal = {
      id: 'g5', title: 'No total, count', order: 4, createdAt: 5,
      outcome: { kind: 'count', unit: 'km', target: 1000 },
      progress: { '2026-09-10': 50 },
      milestones: [],
    };
    const [p] = migrateGoalsV3({ goals: [noTotal] }).projects;
    expect(p.total.time).toBe(0);
  });
});

describe('migrateTtGoals (the full tt-goals version chain)', () => {
  // A genuine v1 goal: `{ type, target, period }`, no `outcome`/`effort` yet —
  // those were introduced by the v1 → v2 leg. Real user progress logged
  // against it must survive the whole chain, not just the final v3 → v4 leg.
  const v1TimeGoal = {
    id: 'v1', title: 'Old-style time goal', type: 'time', target: 5 * HOUR,
    period: 'weekly', createdAt: 1, order: 0,
    progress: { '2026-09-01': 3 * HOUR },
  };

  it('carries a v1 goal\'s logged time all the way to a project, run at version 1', () => {
    const { projects } = migrateTtGoals({ goals: [v1TimeGoal] }, 1);
    const [p] = projects;
    expect(p.name).toBe('Old-style time goal');
    expect(p.progress.time['2026-09-01']).toBe(3 * HOUR);
    expect(p.total.time).toBe(3 * HOUR);
    expect(p.target).toEqual({ metric: 'time', amount: 5 * HOUR, period: 'weekly' });
  });

  // A genuine v2 goal: has `outcome`/`effort`/`progress`, but no `total` — that
  // field was only introduced by the v2 → v3 "seed total" leg.
  const v2Goal = {
    id: 'v2', title: 'V2 goal, no total yet', createdAt: 5, order: 1,
    outcome: { kind: 'time', targetHours: 10 },
    effort: { metric: 'time', amount: HOUR, period: 'daily' },
    progress: { '2026-09-10': 2 * HOUR, '2026-09-11': 1 * HOUR },
    milestones: [],
  };

  it('seeds total.time from progress for a v2 goal, run at version 2', () => {
    const { projects } = migrateTtGoals({ goals: [v2Goal] }, 2);
    const [p] = projects;
    expect(p.total.time).toBe(3 * HOUR);
    expect(p.progress.time).toEqual(v2Goal.progress);
  });

  it('behaves as it does today for a v3 goal, run at version 3 (regression guard)', () => {
    const { projects } = migrateTtGoals({ goals: [timeGoal] }, 3);
    const [p] = projects;
    expect(p.name).toBe('Learn to code');
    expect(p.progress.time['2026-09-14']).toBe(4 * HOUR);
    expect(p.total.time).toBe(4 * HOUR);
    expect(p.target).toEqual({ metric: 'time', amount: 10 * HOUR, period: 'weekly' });
  });

  it('passes v4-shaped state straight through unchanged', () => {
    const v4State = {
      projects: [{
        id: 'p1', name: 'Already a project', createdAt: 1, order: 0,
        progress: { time: { '2026-09-14': HOUR } }, total: { time: HOUR },
      }],
    };
    expect(migrateTtGoals(v4State, 4)).toEqual(v4State);
  });
});
