import { beforeEach, describe, expect, it } from 'vitest';
import { useProjects } from './projects';
import type { Project, TimeEntry } from '../types';
import { dayKeyOf } from '../utils/thirdTime';

const HOUR = 3_600_000;

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Project',
    createdAt: 0,
    order: 0,
    progress: { time: {} },
    total: { time: 0 },
    ...overrides,
  };
}

function workEntry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 'e',
    kind: 'work',
    startedAt: 0,
    endedAt: 0,
    mode: 'third',
    ...overrides,
  };
}

beforeEach(() => {
  useProjects.setState({
    projects: [
      project({ id: 'p1', name: 'Alpha' }),
      project({ id: 'p2', name: 'Beta' }),
    ],
  });
});

describe('recomputeFrom', () => {
  it('sums each entry into the right project\'s bucket', () => {
    const t1 = new Date('2026-09-10T10:00:00').getTime();
    const t2 = new Date('2026-09-10T12:00:00').getTime();
    const entries: TimeEntry[] = [
      workEntry({ id: 'e1', projectId: 'p1', startedAt: t1, endedAt: t1 + HOUR }),
      workEntry({ id: 'e2', projectId: 'p2', startedAt: t2, endedAt: t2 + 30 * 60_000 }),
    ];

    useProjects.getState().recomputeFrom(entries);

    const [p1, p2] = useProjects.getState().projects;
    const key = dayKeyOf(t1, 0);
    expect(p1.progress.time[key]).toBe(HOUR);
    expect(p1.total.time).toBe(HOUR);
    expect(p2.progress.time[dayKeyOf(t2, 0)]).toBe(30 * 60_000);
    expect(p2.total.time).toBe(30 * 60_000);
  });

  it('buckets a historical entry by its own startedAt, not by today', () => {
    const longAgo = new Date('2020-01-15T09:00:00').getTime();
    const entries: TimeEntry[] = [
      workEntry({ id: 'e1', projectId: 'p1', startedAt: longAgo, endedAt: longAgo + 2 * HOUR }),
    ];

    useProjects.getState().recomputeFrom(entries);

    const [p1] = useProjects.getState().projects;
    const expectedKey = dayKeyOf(longAgo, 0);
    expect(expectedKey).toBe('2020-01-15');
    expect(p1.progress.time[expectedKey]).toBe(2 * HOUR);
    expect(p1.progress.time[dayKeyOf(Date.now(), 0)]).toBeUndefined();
    expect(p1.total.time).toBe(2 * HOUR);
  });

  it('excludes break entries even when they carry a projectId', () => {
    const t = new Date('2026-09-10T10:00:00').getTime();
    const entries: TimeEntry[] = [
      workEntry({ id: 'e1', kind: 'break', projectId: 'p1', startedAt: t, endedAt: t + HOUR }),
    ];

    useProjects.getState().recomputeFrom(entries);

    const [p1] = useProjects.getState().projects;
    expect(p1.progress.time).toEqual({});
    expect(p1.total.time).toBe(0);
  });

  it('resets a project with no matching entries to {} / 0, clearing whatever was there', () => {
    useProjects.setState({
      projects: [
        project({ id: 'p1', progress: { time: { '2026-01-01': 5 * HOUR } }, total: { time: 5 * HOUR } }),
      ],
    });

    useProjects.getState().recomputeFrom([]);

    const [p1] = useProjects.getState().projects;
    expect(p1.progress.time).toEqual({});
    expect(p1.total.time).toBe(0);
  });
});
