import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitAtBoundary } from '../utils/ledger';
import { useSession } from './session';
import { useSettings } from './settings';
import { useProjects } from './projects';
import { useTasks } from './tasks';
import type { Project } from '../types';

const HOUR = 3_600_000;

describe('splitAtBoundary', () => {
  const open = { kind: 'work' as const, startedAt: 0, mode: 'third' as const, projectId: 'p1' };

  it('closes the entry at the boundary', () => {
    const { closed } = splitAtBoundary(open, 5 * HOUR, 7 * HOUR);
    expect(closed).toMatchObject({ kind: 'work', startedAt: 0, endedAt: 5 * HOUR, projectId: 'p1' });
  });

  it('reopens the same kind and project on the far side', () => {
    const { reopened } = splitAtBoundary(open, 5 * HOUR, 7 * HOUR);
    expect(reopened).toMatchObject({ kind: 'work', startedAt: 5 * HOUR, projectId: 'p1' });
  });

  it('loses no time across the split', () => {
    const { closed, reopened } = splitAtBoundary(open, 5 * HOUR, 7 * HOUR);
    const total = (closed.endedAt - closed.startedAt) + (7 * HOUR - reopened.startedAt);
    expect(total).toBe(7 * HOUR);
  });
});

// A stint that starts on day A and stops on day B used to be filed entirely
// under day B: the mount effect archived day A and reset `daily` to day B,
// but left `timerStart` pointing at day A, so the eventual stop pushed an
// entry into the wrong day's (already-archived) entries. The fix is for
// `maybeArchivePreviousDay` to split the open segment at its own day's
// boundary before archiving, wherever the rollover is discovered.
describe('maybeArchivePreviousDay — a stint spanning the boundary', () => {
  const dayA = '2024-01-01';
  const dayB = '2024-01-02';

  beforeEach(() => {
    useSettings.setState({ dayEndHour: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes the pre-boundary part into the archived day, not today', () => {
    const boundary = new Date(2024, 0, 2, 0, 0, 0, 0).getTime(); // dayA's dayEndOf
    const timerStart = new Date(2024, 0, 1, 22, 0, 0, 0).getTime(); // 10pm on day A

    useSession.setState({
      daily: { date: dayA, entries: [] },
      history: [],
      timerState: 'working',
      timerStart,
      activeProjectId: 'p1',
      activeTaskId: undefined,
    });

    // The app reopens on day B, well past the boundary.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 2, 10, 0, 0, 0));

    useSession.getState().maybeArchivePreviousDay();

    const state = useSession.getState();

    // Day A is archived, carrying the closed segment.
    const archived = state.history.find((h) => h.date === dayA);
    expect(archived).toBeDefined();
    expect(archived!.entries).toHaveLength(1);
    expect(archived!.entries[0]).toMatchObject({
      kind: 'work',
      startedAt: timerStart,
      endedAt: boundary,
      projectId: 'p1',
    });

    // Today's daily is empty and unmarked by yesterday's stint.
    expect(state.daily.date).toBe(dayB);
    expect(state.daily.entries).toHaveLength(0);

    // The still-running timer reopened on the near side of the boundary, so
    // whenever it eventually stops, the resulting entry lands in today.
    expect(state.timerState).toBe('working');
    expect(state.timerStart).toBe(boundary);
  });

  // The same misattribution, hit a different way: no reload in between, just
  // a tab left open across the boundary that eventually gets a Stop click.
  // `stopWork` has to run `maybeArchivePreviousDay` before it finalizes the
  // entry — while the segment is still open and there is still something to
  // split — or the whole stint (both sides of the boundary) gets built from
  // the stale `timerStart` and filed as one block under whichever day
  // `daily` happens to point at first.
  it('stopWork splits the stint at the boundary instead of filing it whole', () => {
    const timerStart = new Date(2024, 0, 1, 22, 0, 0, 0).getTime(); // 10pm on day A
    const boundary = new Date(2024, 0, 2, 0, 0, 0, 0).getTime();
    const stopAt = new Date(2024, 0, 2, 2, 0, 0, 0).getTime(); // 2am on day B

    useSession.setState({
      daily: { date: dayA, entries: [] },
      history: [],
      timerState: 'working',
      timerStart,
      activeProjectId: 'p1',
      activeTaskId: undefined,
    });

    vi.useFakeTimers();
    vi.setSystemTime(stopAt);

    useSession.getState().stopWork();

    const state = useSession.getState();

    const archived = state.history.find((h) => h.date === dayA);
    expect(archived).toBeDefined();
    expect(archived!.entries).toHaveLength(1);
    expect(archived!.entries[0]).toMatchObject({ startedAt: timerStart, endedAt: boundary });

    // The 2 hours worked past midnight land in today, not in yesterday's
    // archive and not lost between the two.
    expect(state.daily.date).toBe(dayB);
    expect(state.daily.entries).toHaveLength(1);
    expect(state.daily.entries[0]).toMatchObject({ startedAt: boundary, endedAt: stopAt });
    expect(state.timerState).toBe('idle');
  });

  // The ledger got the split right from day one — this is about the two
  // aggregates that ride alongside it. `stopWork` only ever sees the
  // reopened, post-boundary half; if the boundary split does not credit the
  // pre-boundary half itself, that whole chunk of work is credited nowhere.
  it('credits the project and task for both halves of a boundary-split stint', () => {
    const timerStart = new Date(2024, 0, 1, 22, 0, 0, 0).getTime(); // 10pm on day A
    const stopAt = new Date(2024, 0, 2, 2, 0, 0, 0).getTime(); // 2am on day B
    const fullDurationMs = stopAt - timerStart;

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

    useProjects.setState({ projects: [project({ id: 'p1' })] });
    useTasks.setState({
      tasks: [
        {
          id: 't1',
          title: 'Task',
          status: 'todo',
          createdAt: 0,
          scheduledDate: dayA,
          order: 0,
          subtasks: [],
          trackedMs: 0,
        },
      ],
    });

    useSession.setState({
      daily: { date: dayA, entries: [] },
      history: [],
      timerState: 'working',
      timerStart,
      activeProjectId: 'p1',
      activeTaskId: 't1',
    });

    vi.useFakeTimers();
    vi.setSystemTime(stopAt);

    // The boundary split runs first (inside stopWork), crediting the
    // pre-boundary half; stopWork itself credits the reopened, post-boundary
    // half when it closes.
    useSession.getState().stopWork();

    expect(useProjects.getState().projects[0].total.time).toBe(fullDurationMs);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(fullDurationMs);
  });

  // `commitTime` used to bucket every commit under `Date.now()`, which is
  // right for an ordinary stop but wrong for the boundary-split half: that
  // half happened before the boundary, so a project with a daily target must
  // see it land in yesterday's bucket, not today's — or a late-night stint
  // shows up against today's target instead of the day it was actually
  // worked on.
  it('buckets each half of a boundary-split stint under its own day, not the day it was committed on', () => {
    const timerStart = new Date(2024, 0, 1, 22, 0, 0, 0).getTime(); // 10pm on day A
    const boundary = new Date(2024, 0, 2, 0, 0, 0, 0).getTime();
    const stopAt = new Date(2024, 0, 2, 2, 0, 0, 0).getTime(); // 2am on day B

    function project(overrides: Partial<Project>): Project {
      return {
        id: 'p1',
        name: 'Project',
        createdAt: 0,
        order: 0,
        target: { metric: 'time', amount: HOUR, period: 'daily' },
        progress: { time: {} },
        total: { time: 0 },
        ...overrides,
      };
    }

    useProjects.setState({ projects: [project({ id: 'p1' })] });
    useTasks.setState({ tasks: [] });

    useSession.setState({
      daily: { date: dayA, entries: [] },
      history: [],
      timerState: 'working',
      timerStart,
      activeProjectId: 'p1',
      activeTaskId: undefined,
    });

    vi.useFakeTimers();
    vi.setSystemTime(stopAt);

    useSession.getState().stopWork();

    const [p1] = useProjects.getState().projects;
    // Pre-boundary half (10pm–midnight, day A) and post-boundary half
    // (midnight–2am, day B) must land in two distinct daily buckets, each
    // sized to its own half — not one bucket sized to the whole stint.
    expect(p1.progress.time[dayA]).toBe(boundary - timerStart);
    expect(p1.progress.time[dayB]).toBe(stopAt - boundary);
    expect(p1.total.time).toBe(stopAt - timerStart);
  });
});
