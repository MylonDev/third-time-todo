import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjects } from './projects';
import { useSession } from './session';
import { useSettings } from './settings';
import { useTasks } from './tasks';
import type { Project, TimeEntry } from '../types';

const HOUR = 3_600_000;
const MIN = 60_000;
const at = (h: number, m = 0, day = 22) => new Date(2026, 8, day, h, m).getTime();

function project(id: string): Project {
  return { id, name: id, createdAt: 0, order: 0, progress: { time: {} }, total: { time: 0 } };
}

function entry(id: string, kind: 'work' | 'break', startedAt: number, endedAt: number, extra: Partial<TimeEntry> = {}): TimeEntry {
  return { id, kind, startedAt, endedAt, mode: 'third', ...extra };
}

const s = () => useSession.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(18));
  useSettings.setState({ dayEndHour: 0, mode: 'third' });
  useTasks.setState({ tasks: [] });
  useProjects.setState({ projects: [project('p1'), project('p2')] });
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

afterEach(() => vi.useRealTimers());

describe('editing today', () => {
  it('trimming a work block lowers the bank by the rest it had earned', () => {
    s().addEntry(entry('w', 'work', at(9), at(12)));
    expect(s().bank()).toBe(HOUR); // 3h at 1:3
    s().updateEntry('w', { endedAt: at(10, 30) });
    expect(s().bank()).toBe(30 * MIN);
  });

  it('the same trim lowers the project’s period progress', () => {
    s().addEntry(entry('w', 'work', at(9), at(12), { projectId: 'p1' }));
    s().updateEntry('w', { endedAt: at(10) });
    expect(useProjects.getState().projects[0].progress.time['2026-09-22']).toBe(HOUR);
  });

  it('reassigning an entry moves its time to the other project', () => {
    s().addEntry(entry('w', 'work', at(9), at(10), { projectId: 'p1' }));
    s().updateEntry('w', { projectId: 'p2' });
    const [p1, p2] = useProjects.getState().projects;
    expect(p1.total.time).toBe(0);
    expect(p2.total.time).toBe(HOUR);
  });

  it('refuses an edit that would overlap a neighbour, and leaves both alone', () => {
    s().addEntry(entry('a', 'work', at(9), at(10)));
    s().addEntry(entry('b', 'break', at(10), at(10, 20)));
    const refusal = s().updateEntry('a', { endedAt: at(10, 10) });
    expect(refusal).toMatch(/overlaps/);
    expect(s().daily.entries.find((e) => e.id === 'a')!.endedAt).toBe(at(10));
    expect(s().daily.entries).toHaveLength(2);
  });

  it('refuses an entry that crosses the day boundary', () => {
    expect(s().addEntry(entry('x', 'work', at(23), at(1, 0, 23)))).toMatch(/another day/);
  });

  it('refuses an entry that ends in the future', () => {
    expect(s().addEntry(entry('x', 'work', at(17), at(19)))).toMatch(/future/);
  });

  it('refuses an entry that runs into the running timer', () => {
    useSession.setState({ timerState: 'working', timerStart: at(17) });
    expect(s().addEntry(entry('x', 'work', at(16), at(17, 30)))).toMatch(/timer/);
    expect(s().addEntry(entry('y', 'work', at(16), at(17)))).toBeNull();
  });

  it('a block trimmed to nothing is deleted', () => {
    s().addEntry(entry('w', 'work', at(9), at(10)));
    expect(s().updateEntry('w', { endedAt: at(9) })).toBeNull();
    expect(s().daily.entries).toHaveLength(0);
  });

  it('a manually added block earns rest like any other', () => {
    expect(s().addEntry(entry('m', 'work', at(14), at(15, 30)))).toBeNull();
    expect(s().bank()).toBe(30 * MIN);
  });

  it('a break names no project or task', () => {
    s().addEntry(entry('b', 'break', at(9), at(9, 10), { projectId: 'p1', taskId: 't' }));
    expect(s().daily.entries[0]).toMatchObject({ projectId: undefined, taskId: undefined });
  });

  it('split cuts one block into two that keep kind, project and mode', () => {
    s().addEntry(entry('w', 'work', at(9), at(11), { projectId: 'p1', mode: 'half' }));
    expect(s().splitEntry('w', at(10))).toBeNull();
    const [a, b] = s().daily.entries;
    expect(a).toMatchObject({ id: 'w', startedAt: at(9), endedAt: at(10), projectId: 'p1', mode: 'half' });
    expect(b).toMatchObject({ startedAt: at(10), endedAt: at(11), projectId: 'p1', mode: 'half', kind: 'work' });
    expect(useProjects.getState().projects[0].total.time).toBe(2 * HOUR);
  });

  it('refuses a split outside the block', () => {
    s().addEntry(entry('w', 'work', at(9), at(10)));
    expect(s().splitEntry('w', at(10))).toMatch(/inside/);
  });
});

describe('editing an archived day', () => {
  beforeEach(() => {
    useSession.setState({
      history: [{
        date: '2026-09-21',
        totalWorkMs: 2 * HOUR,
        totalBreakMs: 0,
        unusedRestMs: 40 * MIN,
        entries: [entry('old', 'work', at(9, 0, 21), at(11, 0, 21), { projectId: 'p1' })],
      }],
    });
  });

  it('re-sums the archived totals rather than patching them', () => {
    s().updateEntry('old', { endedAt: at(10, 0, 21) });
    const day = s().history.find((h) => h.date === '2026-09-21')!;
    expect(day.totalWorkMs).toBe(HOUR);
    // What the bank held at turnover is history, not something an edit rewinds.
    expect(day.unusedRestMs).toBe(40 * MIN);
    expect(useProjects.getState().projects[0].total.time).toBe(HOUR);
  });

  it('accepts a forgotten block on a past day, up to that day’s end', () => {
    expect(s().addEntry(entry('late', 'work', at(22, 0, 21), at(0, 0, 22)))).toBeNull();
    expect(s().history.find((h) => h.date === '2026-09-21')!.totalWorkMs).toBe(4 * HOUR);
  });

  it('creates the archive row for a past day that had nothing in it', () => {
    expect(s().addEntry(entry('new', 'work', at(9, 0, 15), at(10, 0, 15)))).toBeNull();
    expect(s().history.find((h) => h.date === '2026-09-15')!.totalWorkMs).toBe(HOUR);
  });
});

describe('a later day boundary', () => {
  it('keeps 01:00 inside the day that began the evening before', () => {
    useSettings.setState({ dayEndHour: 2 });
    useSession.setState({
      history: [{ date: '2026-09-21', totalWorkMs: 0, totalBreakMs: 0, unusedRestMs: 0, entries: [] }],
    });
    expect(s().addEntry(entry('n', 'work', at(23, 30, 21), at(1, 30, 22)))).toBeNull();
    expect(s().history.find((h) => h.date === '2026-09-21')!.entries).toHaveLength(1);
  });
});
