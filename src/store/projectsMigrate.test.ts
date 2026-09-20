import { describe, expect, it } from 'vitest';
import { migrateGoalsV3 } from './projectsMigrate';

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
});
