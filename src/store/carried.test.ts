import { beforeEach, describe, expect, it } from 'vitest';
import { useProjects } from './projects';
import { useSession } from './session';
import { useSettings } from './settings';
import { useTasks, migrateTtTasks } from './tasks';
import type { HistoryEntry, Project, Task, TimeEntry } from '../types';

const HOUR = 3_600_000;

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', name: 'Project', createdAt: 0, order: 0,
    progress: { time: {} }, total: { time: 0 },
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'Task', status: 'todo', createdAt: 0, scheduledDate: '2026-09-22',
    order: 0, subtasks: [], trackedMs: 0,
    ...overrides,
  };
}

function work(id: string, startedAt: number, ms: number, extra: Partial<TimeEntry> = {}): TimeEntry {
  return { id, kind: 'work', startedAt, endedAt: startedAt + ms, mode: 'third', ...extra };
}

function day(date: string, entries: TimeEntry[]): HistoryEntry {
  return { date, totalWorkMs: 0, totalBreakMs: 0, unusedRestMs: 0, entries };
}

beforeEach(() => {
  useSettings.setState({ dayEndHour: 0 });
  useTasks.setState({ tasks: [] });
  useSession.setState({
    daily: { date: '2026-09-22', entries: [] },
    history: [],
    timerState: 'idle',
    timerStart: null,
    sessionClosedAt: null,
    activeProjectId: undefined,
    activeTaskId: undefined,
  });
});

// Renaming a project used to re-sum it from the ledger alone — and a goal
// migrated from before the ledger existed has no entries behind its hours, so
// the rename zeroed every one of them.
describe('time the ledger cannot see', () => {
  it('survives a project rename', () => {
    useProjects.setState({
      projects: [project({
        progress: { time: { '2026-09-14': 5 * HOUR } },
        total: { time: 5 * HOUR },
        carried: { time: { '2026-09-14': 5 * HOUR }, total: 5 * HOUR },
      })],
    });

    useProjects.getState().updateProject('p1', { name: 'Renamed' });

    const p = useProjects.getState().projects[0];
    expect(p.total.time).toBe(5 * HOUR);
    expect(p.progress.time['2026-09-14']).toBe(5 * HOUR);
  });

  it('is added to what the ledger holds, not in place of it', () => {
    useProjects.setState({ projects: [project({ carried: { time: {}, total: 2 * HOUR } })] });
    const at = new Date(2026, 8, 22, 9).getTime();
    useProjects.getState().recomputeFrom([work('e', at, HOUR, { projectId: 'p1' })]);
    expect(useProjects.getState().projects[0].total.time).toBe(3 * HOUR);
  });

  it('keeps a manual task adjustment through a re-sum', () => {
    useTasks.setState({ tasks: [task()] });
    useTasks.getState().adjustManualMs('t1', 20 * 60_000);
    useTasks.getState().recomputeFrom([]);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(20 * 60_000);
  });

  it('does not let a clamped subtraction leave hidden debt', () => {
    useTasks.setState({ tasks: [task({ trackedMs: 10 * 60_000, carriedMs: 10 * 60_000 })] });
    useTasks.getState().adjustManualMs('t1', -60 * 60_000);
    useTasks.getState().adjustManualMs('t1', 5 * 60_000);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(5 * 60_000);
  });
});

describe('history aging out', () => {
  it('carries the oldest day\'s time forward instead of dropping it', () => {
    useProjects.setState({ projects: [project()] });
    useTasks.setState({ tasks: [task({ projectId: 'p1' })] });

    // 120 archived days, the oldest holding an hour on the task.
    const oldest = new Date(2026, 4, 1, 10).getTime();
    const history: HistoryEntry[] = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(2026, 4, 1 + i);
      const key = d.toISOString().slice(0, 10);
      return day(key, i === 0 ? [work('old', oldest, HOUR, { taskId: 't1' })] : []);
    });
    const today = new Date(2026, 8, 22, 10).getTime();
    useSession.setState({
      history,
      daily: { date: '2026-09-22', entries: [work('new', today, HOUR, { taskId: 't1' })] },
    });

    useSession.getState().archiveDay();
    useSession.setState({ daily: { date: '2026-09-23', entries: [] } }); // as the roll does
    expect(useSession.getState().history).toHaveLength(120);

    useSession.getState().removeEntry('nothing'); // any edit triggers a re-sum
    expect(useProjects.getState().projects[0].total.time).toBe(2 * HOUR);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(2 * HOUR);
  });
});

describe('archiving a day that is already archived', () => {
  it('merges the new entries in rather than replacing the day', () => {
    const a = new Date(2026, 8, 21, 20).getTime();
    const b = new Date(2026, 8, 22, 1).getTime();
    useSession.setState({
      history: [day('2026-09-21', [work('a', a, HOUR)])],
      daily: { date: '2026-09-21', entries: [work('b', b, HOUR)] },
    });
    useSession.getState().archiveDay();
    const archived = useSession.getState().history.find((h) => h.date === '2026-09-21')!;
    expect(archived.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(archived.totalWorkMs).toBe(2 * HOUR);
  });
});

describe('tt-tasks v7 → v8', () => {
  it('carries tracked time the ledger has no entries for', () => {
    const at = new Date(2026, 8, 22, 9).getTime();
    const { tasks } = migrateTtTasks(
      { tasks: [task({ id: 't1', trackedMs: 3 * HOUR }), task({ id: 't2', trackedMs: HOUR })] },
      7,
      [work('e', at, HOUR, { taskId: 't2' })]
    ) as { tasks: Task[] };
    expect(tasks.find((t) => t.id === 't1')!.carriedMs).toBe(3 * HOUR);
    expect(tasks.find((t) => t.id === 't2')!.carriedMs).toBe(0);
  });
});
