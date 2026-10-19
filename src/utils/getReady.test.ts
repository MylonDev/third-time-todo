import { describe, expect, it } from 'vitest';
import type { GetReadyDay, GetReadyStep, TimeEntry } from '../types';
import { makeStep, recordGetReady, removeStep, renameStep, sameSteps, shouldOfferGetReady } from './getReady';

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
