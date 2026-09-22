import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './session';
import { useSettings } from './settings';
import { useProjects } from './projects';
import { useTasks } from './tasks';

const MINUTE = 60_000;

// Monday night, laptop closed half an hour in, reopened on Wednesday morning.
// The 34 hours in between are wall-clock during which nobody was here, and
// none of it is work, rest, or anything else the ledger has a name for.
const MONDAY = '2026-09-21';
const startedAt = new Date(2026, 8, 21, 22, 0, 0, 0).getTime();
const closedAt = new Date(2026, 8, 21, 22, 30, 0, 0).getTime();
const reopenedAt = new Date(2026, 8, 23, 9, 0, 0, 0).getTime();
const workedMs = closedAt - startedAt;

function everyEntry() {
  const { daily, history } = useSession.getState();
  return [...history.flatMap((h) => h.entries), ...daily.entries];
}

beforeEach(() => {
  useSettings.setState({ dayEndHour: 0, mode: 'third' });
  useProjects.setState({
    projects: [
      {
        id: 'p1',
        name: 'Alpha',
        createdAt: 0,
        order: 0,
        progress: { time: {} },
        total: { time: 0 },
      },
    ],
  });
  useTasks.setState({
    tasks: [
      {
        id: 't1',
        title: 'Task',
        status: 'todo',
        createdAt: 0,
        scheduledDate: MONDAY,
        order: 0,
        subtasks: [],
        trackedMs: 0,
        projectId: 'p1',
      },
    ],
  });
  useSession.setState({
    daily: { date: MONDAY, entries: [] },
    history: [],
    timerState: 'working',
    timerStart: startedAt,
    sessionClosedAt: closedAt,
    activeProjectId: 'p1',
    activeTaskId: 't1',
    restorePrompt: null,
  });
  vi.useFakeTimers();
  vi.setSystemTime(reopenedAt);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a timer that was still running when the app went away', () => {
  it('credits nothing at all while the close stamp is still unanswered', () => {
    useSession.getState().maybeArchivePreviousDay();

    // The gap between the close and the reopen belongs to nobody yet — the
    // user has not seen the restore prompt, let alone answered it.
    expect(useProjects.getState().projects[0].total.time).toBe(0);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(0);
    expect(everyEntry()).toHaveLength(0);
  });

  it('settles the stint at the close stamp, crediting only the time worked', () => {
    useSession.getState().settleClosedSession();

    expect(useProjects.getState().projects[0].total.time).toBe(workedMs);
    expect(useProjects.getState().projects[0].progress.time[MONDAY]).toBe(workedMs);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(workedMs);
    expect(everyEntry()).toHaveLength(1);
    expect(everyEntry()[0]).toMatchObject({ startedAt, endedAt: closedAt, projectId: 'p1' });
  });

  it('settles once however many times it runs', () => {
    useSession.getState().settleClosedSession();
    useSession.getState().settleClosedSession();

    expect(everyEntry()).toHaveLength(1);
    expect(useProjects.getState().projects[0].total.time).toBe(workedMs);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(workedMs);
  });

  it('leaves no future timerStart and no inverted entry when the session is continued', () => {
    useSession.getState().settleClosedSession();
    useSession.getState().continueRestoredSession();

    expect(useSession.getState().timerStart).toBeLessThanOrEqual(Date.now());

    vi.setSystemTime(reopenedAt + 10 * MINUTE);
    useSession.getState().stopWork();

    for (const entry of everyEntry()) {
      expect(entry.endedAt).toBeGreaterThanOrEqual(entry.startedAt);
    }
    // Half an hour on Monday plus ten minutes on Wednesday — the day and a
    // half the laptop was shut is credited to neither.
    expect(useProjects.getState().projects[0].total.time).toBe(workedMs + 10 * MINUTE);
    expect(useTasks.getState().tasks[0].trackedMs).toBe(workedMs + 10 * MINUTE);
  });

  it('gives back every credited minute when the session is discarded', () => {
    useSession.getState().settleClosedSession();
    useSession.getState().discardRestoredSession();

    expect(useProjects.getState().projects[0].total.time).toBe(0);
    expect(useProjects.getState().projects[0].progress.time).toEqual({});
    expect(useTasks.getState().tasks[0].trackedMs).toBe(0);
    expect(everyEntry()).toHaveLength(0);
    expect(useSession.getState().timerState).toBe('idle');
  });

  it('counts the gap as active time only when the user asks it to', () => {
    useSession.getState().settleClosedSession();
    useSession.getState().resumeRestoredSession();

    vi.setSystemTime(reopenedAt + 10 * MINUTE);
    useSession.getState().stopWork();

    // Resume is the one path that credits the gap, and it is offered only
    // inside the half-hour cutoff the modal enforces.
    const awayMs = reopenedAt - closedAt;
    expect(useProjects.getState().projects[0].total.time).toBe(workedMs + awayMs + 10 * MINUTE);
  });
});
