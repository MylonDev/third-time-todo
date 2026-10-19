import { describe, expect, it } from 'vitest';
import type { GetReadyDay, GetReadyStep, TimeEntry } from '../types';
import { makeStep, mergeDays, recordGetReady, removeStep, renameStep, sameSteps, shouldOfferGetReady } from './getReady';

/** Local time on 12 Oct 2026 plus `day` days. */
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 12 + day, h, m).getTime();
const TODAY = '2026-10-12';

const steps: GetReadyStep[] = [
  { id: 'water', text: 'Water' },
  { id: 'desk', text: 'Clear desk' },
];

let n = 0;
const entry = (state: TimeEntry['state'], startedAt: number, endedAt: number | null, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id: `e${n++}`,
  state,
  startedAt,
  endedAt,
  updatedAt: startedAt,
  ...extra,
});

const offer = (over: { steps?: GetReadyStep[]; days?: GetReadyDay[]; entries?: TimeEntry[]; today?: string; dayEndHour?: number } = {}) =>
  shouldOfferGetReady(over.steps ?? steps, over.days ?? [], over.entries ?? [], over.today ?? TODAY, over.dayEndHour ?? 0);

describe('shouldOfferGetReady', () => {
  it('is offered with steps on a clean day', () => {
    expect(offer()).toBe(true);
  });

  it('is not offered with no steps', () => {
    expect(offer({ steps: [] })).toBe(false);
  });

  it('is not offered once the day has a row, done or skipped', () => {
    expect(offer({ days: [{ id: TODAY, done: ['water'], skipped: false, updatedAt: 1 }] })).toBe(false);
    expect(offer({ days: [{ id: TODAY, done: [], skipped: true, updatedAt: 1 }] })).toBe(false);
  });

  it("is offered when only another day's row exists", () => {
    expect(offer({ days: [{ id: '2026-10-11', done: [], skipped: true, updatedAt: 1 }] })).toBe(true);
  });

  it('is not offered when a session began today, whichever device it was on', () => {
    expect(offer({ entries: [entry('should', at(0, 8), at(0, 9))] })).toBe(false);
    expect(offer({ entries: [entry('timed', at(0, 8), at(0, 8, 25), { plannedMs: 25 * 60_000 })] })).toBe(false);
    expect(offer({ entries: [entry('want', at(0, 8), null)] })).toBe(false);
  });

  it("is offered when the only entries are yesterday's", () => {
    expect(offer({ entries: [entry('should', at(-1, 14), at(-1, 16))] })).toBe(true);
  });

  it('counts a day that ends at 3 AM: a session ending at 1 AM belongs to yesterday', () => {
    // Started 23:00 yesterday, ended 02:00 today; with a 3 AM day end both are yesterday's.
    expect(offer({ dayEndHour: 3, entries: [entry('should', at(-1, 23), at(0, 2))] })).toBe(true);
    // A start at 02:00 is still yesterday's day, so it does not hide today's offer.
    expect(offer({ dayEndHour: 3, entries: [entry('should', at(0, 2), at(0, 2, 30))] })).toBe(true);
    // A start at 04:00 is today's.
    expect(offer({ dayEndHour: 3, entries: [entry('should', at(0, 4), at(0, 5))] })).toBe(false);
  });

  it('does not treat a Focus carried past midnight and switched to Rest as a new start', () => {
    const carried = [entry('should', at(-1, 23), at(0, 0, 30)), entry('want', at(0, 0, 30), at(0, 1))];
    // Stopped at 01:00; the next start, at 09:00, is the day's first.
    expect(offer({ entries: carried })).toBe(true);
  });

  it('does not treat a Fix timer split during a carried session as a new start', () => {
    // Focus 23:00-00:20, a fixed-in Rest 00:20-00:40, Focus again 00:40 on.
    const fixed = [entry('should', at(-1, 23), at(0, 0, 20)), entry('want', at(0, 0, 20), at(0, 0, 40)), entry('should', at(0, 0, 40), at(0, 1))];
    expect(offer({ entries: fixed })).toBe(true);
  });

  it('is not offered after a later session in the day began fresh', () => {
    const entries = [entry('should', at(-1, 23), at(0, 0, 30)), entry('want', at(0, 0, 30), at(0, 1)), entry('should', at(0, 9), at(0, 10))];
    expect(offer({ entries })).toBe(false);
  });

  it('ignores deleted entries', () => {
    expect(offer({ entries: [entry('should', at(0, 8), at(0, 9), { deletedAt: at(0, 9) })] })).toBe(true);
  });

  it('a deleted predecessor does not make a later entry a continuation', () => {
    const entries = [entry('should', at(-1, 23), at(0, 8), { deletedAt: 1 }), entry('want', at(0, 8), at(0, 9))];
    expect(offer({ entries })).toBe(false);
  });

  it('is not offered to steps added after a session has already begun today', () => {
    // No day row exists (the steps did not exist when the session began), but the day has started.
    expect(offer({ steps: [steps[0]], days: [], entries: [entry('should', at(0, 9), at(0, 9, 30))] })).toBe(false);
  });
});

describe('recordGetReady', () => {
  it('adds a row for the day', () => {
    expect(recordGetReady([], TODAY, ['water'], false, 5)).toEqual([{ id: TODAY, done: ['water'], skipped: false, updatedAt: 5 }]);
  });

  it('replaces the same day and keeps the others', () => {
    const days: GetReadyDay[] = [
      { id: '2026-10-11', done: ['desk'], skipped: false, updatedAt: 1 },
      { id: TODAY, done: [], skipped: true, updatedAt: 2 },
    ];
    expect(recordGetReady(days, TODAY, ['water', 'desk'], false, 9)).toEqual([
      { id: '2026-10-11', done: ['desk'], skipped: false, updatedAt: 1 },
      { id: TODAY, done: ['water', 'desk'], skipped: false, updatedAt: 9 },
    ]);
  });

  it('records a skip as nothing ticked', () => {
    expect(recordGetReady([], TODAY, [], true, 3)[0]).toMatchObject({ done: [], skipped: true });
  });
});

describe('steps', () => {
  it('makes a step with its own id and trimmed text', () => {
    const a = makeStep('  Air  ');
    const b = makeStep('Air');
    expect(a.text).toBe('Air');
    expect(a.id).not.toBe(b.id);
  });

  it('renames in place, keeping the id', () => {
    expect(renameStep(steps, 'desk', ' Tidy desk ')).toEqual([steps[0], { id: 'desk', text: 'Tidy desk' }]);
  });

  it('drops a step renamed to nothing', () => {
    expect(renameStep(steps, 'water', '   ')).toEqual([steps[1]]);
  });

  it('removes by filtering the list', () => {
    expect(removeStep(steps, 'water')).toEqual([steps[1]]);
    expect(removeStep(steps, 'nope')).toEqual(steps);
  });

  it('compares lists by id and text, in order', () => {
    expect(
      sameSteps(
        steps,
        steps.map((s) => ({ ...s })),
      ),
    ).toBe(true);
    expect(sameSteps(steps, [...steps].reverse())).toBe(false);
    expect(sameSteps(steps, [steps[0], { id: 'desk', text: 'Other' }])).toBe(false);
    expect(sameSteps(steps, [steps[0]])).toBe(false);
  });
});

describe('mergeDays', () => {
  const day = (done: string[], skipped: boolean, updatedAt: number): GetReadyDay => ({ id: TODAY, done, skipped, updatedAt });
  const NOW = 1000;

  it('returns the local row itself when both say the same, whatever their stamps or order', () => {
    const mine = day(['a', 'b'], false, 10);
    expect(mergeDays(mine, day(['b', 'a'], false, 99), NOW)).toBe(mine);
    const skipped = day([], true, 10);
    expect(mergeDays(skipped, day([], true, 3), NOW)).toBe(skipped);
  });

  it('returns the remote row itself when the union is what it already says', () => {
    const theirs = day(['a', 'b'], false, 5);
    expect(mergeDays(day(['a'], false, 10), theirs, NOW)).toBe(theirs);
    // Skipped on both is the only way to stay skipped, so a remote that did a step wins over a local skip.
    const done = day(['a'], false, 5);
    expect(mergeDays(day([], true, 10), done, NOW)).toBe(done);
  });

  it('returns the local row itself when the union is what it says and it is not older', () => {
    const mine = day(['a', 'b'], false, 10);
    expect(mergeDays(mine, day(['a'], false, 10), NOW)).toBe(mine);
    expect(mergeDays(mine, day(['a'], false, 4), NOW)).toBe(mine);
  });

  it('makes a new row when the local row has everything but is older, so the other device converges', () => {
    const merged = mergeDays(day(['a', 'b'], false, 10), day(['a'], false, 20), NOW);
    expect(merged).toEqual({ id: TODAY, done: ['a', 'b'], skipped: false, updatedAt: NOW + 1 });
  });

  it('makes a new row with the union, sorted, when each side has a step the other lacks', () => {
    expect(mergeDays(day(['water'], false, 10), day(['desk'], false, 20), NOW)).toEqual({
      id: TODAY,
      done: ['desk', 'water'],
      skipped: false,
      updatedAt: NOW + 1,
    });
  });

  it('counts a day as skipped only when both skipped it', () => {
    expect(mergeDays(day([], true, 10), day(['a'], true, 20), NOW)).toMatchObject({ done: ['a'], skipped: true });
    expect(mergeDays(day(['a'], true, 10), day(['b'], false, 20), NOW)).toMatchObject({ done: ['a', 'b'], skipped: false });
  });

  it('stamps the new row above now when the rows are old, so a push cursor already past them still sends it', () => {
    const merged = mergeDays(day(['a'], false, 10), day(['b'], false, 20), 5000);
    expect(merged.updatedAt).toBe(5001);
  });

  it('stamps above both rows when they are newer than now', () => {
    expect(mergeDays(day(['a'], false, 9000), day(['b'], false, 7000), 5000).updatedAt).toBe(9001);
  });

  it('is idempotent: merging the result with the same remote again changes nothing', () => {
    const a = day(['water'], false, 10);
    const b = day(['desk'], false, 20);
    const first = mergeDays(a, b, NOW);
    expect(mergeDays(first, b, NOW + 50)).toBe(first);
    expect(mergeDays(first, a, NOW + 50)).toBe(first);
  });

  it("gives the same row from either side, and each side then accepts the other's result", () => {
    const a = day(['water'], true, 10);
    const b = day(['desk'], false, 20);
    const ab = mergeDays(a, b, NOW);
    const ba = mergeDays(b, a, NOW);
    expect(ab).toEqual({ id: TODAY, done: ['desk', 'water'], skipped: false, updatedAt: NOW + 1 });
    expect(ba).toEqual(ab);
    expect(mergeDays(a, ba, NOW + 1)).toBe(ba);
    expect(mergeDays(b, ab, NOW + 1)).toBe(ab);
    expect(mergeDays(ab, ba, NOW + 1)).toBe(ab);
  });
});
