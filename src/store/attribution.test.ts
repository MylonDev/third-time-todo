import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjects } from './projects';
import { useSession } from './session';
import { useTasks } from './tasks';
import type { Project, Task } from '../types';

const MINUTE = 60_000;
const startAt = new Date(2026, 8, 23, 10, 0, 0, 0).getTime();

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Alpha',
    createdAt: 0,
    order: 0,
    progress: { time: {} },
    total: { time: 0 },
    ...overrides,
  };
}

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'Task',
    status: 'todo',
    createdAt: 0,
    scheduledDate: '2026-09-23',
    order: 0,
    subtasks: [],
    trackedMs: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useProjects.setState({ projects: [project({ id: 'p1' })] });
  useTasks.setState({ tasks: [task({ id: 't1' })] });
  useSession.setState({
    daily: { date: '2026-09-23', entries: [] },
    history: [],
    timerState: 'idle',
    timerStart: null,
    sessionClosedAt: null,
    restorePrompt: null,
    activeProjectId: undefined,
    activeTaskId: 't1',
  });
  vi.useFakeTimers();
  vi.setSystemTime(startAt);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tagging the running task with a project', () => {
  it('moves the stint it is in the middle of onto that project', () => {
    useSession.getState().startWork();
    vi.setSystemTime(startAt + 15 * MINUTE);

    useTasks.getState().setTaskProject('t1', 'p1');

    vi.setSystemTime(startAt + 40 * MINUTE);
    useSession.getState().stopWork('third');

    // The task shows forty minutes, so the project it is filed under has to
    // show them too — the whole stint was this task's work.
    expect(useTasks.getState().tasks[0].trackedMs).toBe(40 * MINUTE);
    expect(useProjects.getState().projects[0].total.time).toBe(40 * MINUTE);
  });
});

describe('deleting the project the timer is pointing at', () => {
  it('clears the active target instead of leaving it aimed at a ghost', () => {
    useTasks.getState().setTaskProject('t1', 'p1');
    useSession.getState().setActive(undefined, 't1');
    useSession.getState().startWork();
    vi.setSystemTime(startAt + 10 * MINUTE);

    useProjects.getState().deleteProject('p1');

    expect(useSession.getState().activeProjectId).toBeUndefined();

    vi.setSystemTime(startAt + 25 * MINUTE);
    useSession.getState().stopWork('third');

    // The task keeps its own record of the whole stint, and nothing written
    // after the delete still names the project that is gone.
    expect(useTasks.getState().tasks[0].trackedMs).toBe(25 * MINUTE);
    const written = useSession.getState().daily.entries;
    expect(written[written.length - 1].projectId).toBeUndefined();
  });
});
