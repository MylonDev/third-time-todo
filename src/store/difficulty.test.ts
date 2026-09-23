import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './session';
import { useSettings } from './settings';
import { useTasks } from './tasks';
import { useProjects } from './projects';
import { recommendMode } from '../utils/difficulty';
import type { TimeEntry } from '../types';

const HOUR = 3_600_000;
const at = (h: number, day = 22) => new Date(2026, 8, day, h).getTime();
const s = () => useSession.getState();

function work(id: string, from: number, to: number, mode: TimeEntry['mode']): TimeEntry {
  return { id, kind: 'work', startedAt: from, endedAt: to, mode };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(15));
  useSettings.setState({ dayEndHour: 0, mode: 'third', difficultyPolicy: { kind: 'quota', perDay: 1 } });
  useTasks.setState({ tasks: [] });
  useProjects.setState({ projects: [] });
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

describe('difficulty per day', () => {
  it('a new day starts at the settings default, not yesterday’s choice', () => {
    s().setDayMode('quarter');
    s().startWork();
    vi.setSystemTime(at(16));
    s().stopWork();
    expect(s().dayMode()).toBe('quarter');

    vi.setSystemTime(at(10, 23));
    s().maybeArchivePreviousDay();
    expect(s().daily.date).toBe('2026-09-23');
    expect(s().dayMode()).toBe('third');
  });

  it('easing off before any work is the day’s first choice, not a reduction', () => {
    expect(s().setDayMode('half')).toBeNull();
    expect(s().setDayMode('third')).toBeNull();
    expect(s().setDayMode('half')).toBeNull();
    expect(s().daily.reductionsUsed ?? 0).toBe(0);
  });

  it('refuses a second reduction under a quota of one, with a reason', () => {
    s().addEntry(work('w', at(9), at(10), 'third'));
    expect(s().setDayMode('half')).toBeNull();
    expect(s().setDayMode('quarter')).toBeNull(); // raising is never blocked
    const refusal = s().setDayMode('third');
    expect(refusal).toMatch(/reduction/);
    expect(s().dayMode()).toBe('quarter');
  });

  it('allows the same changes under the free policy', () => {
    useSettings.setState({ difficultyPolicy: { kind: 'free' } });
    s().addEntry(work('w', at(9), at(10), 'third'));
    expect(s().setDayMode('half')).toBeNull();
    expect(s().setDayMode('quarter')).toBeNull();
    expect(s().setDayMode('third')).toBeNull();
    expect(s().daily.reductionsUsed).toBe(2);
  });

  it('is not retroactive — earlier entries keep the ratio they earned at', () => {
    s().startWork();
    vi.setSystemTime(at(18));
    s().stopWork(); // 3h at 1:3 → 1h of rest
    expect(s().bank()).toBe(HOUR);

    s().setDayMode('half');
    expect(s().daily.entries[0].mode).toBe('third');
    expect(s().bank()).toBe(HOUR);

    s().startWork();
    vi.setSystemTime(at(20));
    s().stopWork(); // 2h at 1:2 → 1h more
    expect(s().bank()).toBe(2 * HOUR);
  });

  it('refuses a change while a timer runs', () => {
    s().startWork();
    expect(s().setDayMode('half')).toMatch(/Stop the timer/);
  });

  it('archives the day’s mode and reductions onto its history entry', () => {
    s().addEntry(work('w', at(9), at(10), 'third'));
    s().setDayMode('half');
    vi.setSystemTime(at(10, 23));
    s().maybeArchivePreviousDay();
    expect(s().history[0]).toMatchObject({ date: '2026-09-22', mode: 'half', reductionsUsed: 1 });
  });

  it('a stint carried over midnight locks the new day at the default', () => {
    useSettings.setState({ mode: 'quarter' });
    vi.setSystemTime(at(23));
    s().startWork();
    vi.setSystemTime(at(1, 23));
    s().maybeArchivePreviousDay();
    useSettings.setState({ mode: 'half' }); // changing the default mid-stint…
    expect(s().dayMode()).toBe('quarter'); // …doesn't re-rate the open segment
  });
});

describe('recommendMode', () => {
  it('suggests from the pace verdict, relative to yesterday', () => {
    expect(recommendMode('below', 'third')).toBe('quarter');
    expect(recommendMode('above', 'third')).toBe('half');
    expect(recommendMode('within', 'half')).toBe('half');
    expect(recommendMode('unknown', 'half')).toBeNull();
    expect(recommendMode('below', 'quarter')).toBe('quarter'); // already hardest
  });
});
