import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjects } from './projects';
import { useSession } from './session';
import { useTasks } from './tasks';
import type { Project, Task, TimeEntry } from '../types';
import { dayKeyOf } from '../utils/thirdTime';
import { targetThisPeriod } from '../utils/project';

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

// Regression coverage for the session store's `addEntry`/`updateEntry`/
// `removeEntry` — they own the timeline's only editable doors into the
// ledger, and each one has to re-sum the project's and task's totals from
// scratch rather than patch a delta onto whatever was there before. A delta
// is only ever right until the same entry is touched again.
describe('editing the timeline re-sums project and task totals', () => {
  function task(overrides: Partial<Task>): Task {
    return {
      id: 't1',
      title: 'Task',
      status: 'todo',
      createdAt: 0,
      scheduledDate: '2026-09-10',
      order: 0,
      subtasks: [],
      trackedMs: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    useTasks.setState({ tasks: [task({ id: 't1' })] });
    useSession.setState({
      daily: { date: '2026-09-10', entries: [] },
      history: [],
      timerState: 'idle',
      timerStart: null,
      activeProjectId: undefined,
      activeTaskId: undefined,
    });
  });

  it('updateEntry tracks a changed duration instead of accumulating on top of the old one', () => {
    const start = new Date('2026-09-10T10:00:00').getTime();
    useSession.getState().addEntry(
      workEntry({ id: 'e1', projectId: 'p1', taskId: 't1', startedAt: start, endedAt: start + HOUR })
    );

    expect(useProjects.getState().projects[0].total.time).toBe(HOUR);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(HOUR);

    // Shrink the entry to 15 minutes — a delta-based commit would have added
    // 15 minutes on top of the hour already there; a re-sum lands on 15
    // minutes flat, because that's what the ledger now says happened.
    useSession.getState().updateEntry('e1', { endedAt: start + 15 * 60_000 });

    expect(useProjects.getState().projects[0].total.time).toBe(15 * 60_000);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(15 * 60_000);
  });

  it('removeEntry drops the totals back down', () => {
    const start = new Date('2026-09-10T10:00:00').getTime();
    useSession.getState().addEntry(
      workEntry({ id: 'e1', projectId: 'p1', taskId: 't1', startedAt: start, endedAt: start + HOUR })
    );

    expect(useProjects.getState().projects[0].total.time).toBe(HOUR);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(HOUR);

    useSession.getState().removeEntry('e1');

    expect(useProjects.getState().projects[0].total.time).toBe(0);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(0);
  });
});

// A project's period buckets are keyed by the target's own period, so editing
// the target re-keys every bucket it ever filled. Nothing else in the store
// can reach a stored aggregate the way this edit can.
describe('editing a project re-sums its buckets from the ledger', () => {
  const workedOn = new Date(2026, 8, 23, 9, 0, 0, 0).getTime(); // Wednesday
  const ninetyMin = 90 * 60_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 23, 18, 0, 0, 0));
    useTasks.setState({ tasks: [] });
    useProjects.setState({
      projects: [
        project({ id: 'p1', target: { metric: 'time', amount: 2 * HOUR, period: 'daily' } }),
      ],
    });
    useSession.setState({
      daily: { date: '2026-09-23', entries: [] },
      history: [],
      timerState: 'idle',
      timerStart: null,
      sessionClosedAt: null,
      activeProjectId: undefined,
      activeTaskId: undefined,
    });
    useSession.getState().addEntry(
      workEntry({ id: 'e1', projectId: 'p1', startedAt: workedOn, endedAt: workedOn + ninetyMin })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('carries the logged time over when the target period changes', () => {
    expect(useProjects.getState().projects[0].progress.time['2026-09-23']).toBe(ninetyMin);

    useProjects.getState().updateProject('p1', {
      target: { metric: 'time', amount: 10 * HOUR, period: 'weekly' },
    });

    const [p1] = useProjects.getState().projects;
    // The same ninety minutes, now filed under the week that Wednesday is in.
    expect(targetThisPeriod(p1, 0)).toBe(ninetyMin);
    expect(p1.progress.time['2026-09-21']).toBe(ninetyMin);
    expect(p1.total.time).toBe(ninetyMin);
  });
});

// An entry may name only the task it was worked on — `addEntry` accepts that
// shape, and `stopWork` writes it whenever the target is a task. The project
// such an entry belongs to is the one its task is filed under.
describe('recomputeFrom resolves a project through the entry\'s task', () => {
  it('credits the task\'s project to an entry that names no project of its own', () => {
    useTasks.setState({
      tasks: [
        {
          id: 't1',
          title: 'Task',
          status: 'todo',
          createdAt: 0,
          scheduledDate: '2026-09-23',
          order: 0,
          subtasks: [],
          trackedMs: 0,
          projectId: 'p1',
        },
      ],
    });
    const t = new Date(2026, 8, 23, 9, 0, 0, 0).getTime();

    useProjects.getState().recomputeFrom([
      workEntry({ id: 'e1', taskId: 't1', startedAt: t, endedAt: t + HOUR }),
    ]);

    const [p1, p2] = useProjects.getState().projects;
    expect(p1.total.time).toBe(HOUR);
    expect(p1.progress.time[dayKeyOf(t, 0)]).toBe(HOUR);
    expect(p2.total.time).toBe(0);
  });
});
