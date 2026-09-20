import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitAtBoundary } from '../utils/ledger';
import { useSession } from './session';
import { useSettings } from './settings';

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

    useSession.getState().stopWork('third');

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
});
