import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../types';
import { mergeById, repairEntries, stampChanged } from './merge';

interface Row {
  id: string;
  updatedAt: number;
  v: string;
}
const row = (id: string, updatedAt: number, v = 'x'): Row => ({ id, updatedAt, v });

describe('mergeById', () => {
  it('takes rows it has not seen', () => {
    expect(mergeById([row('a', 1)], [row('b', 1)]).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('the newer version wins, whichever side it is on', () => {
    expect(mergeById([row('a', 1, 'old')], [row('a', 2, 'new')])[0].v).toBe('new');
    expect(mergeById([row('a', 2, 'new')], [row('a', 1, 'old')])[0].v).toBe('new');
  });

  it('returns the same array when nothing changed', () => {
    const local = [row('a', 2)];
    expect(mergeById(local, [row('a', 1)])).toBe(local);
    expect(mergeById(local, [row('a', 2)])).toBe(local);
    expect(mergeById(local, [])).toBe(local);
  });

  it('breaks a tie the same way from either side', () => {
    const a = [row('k', 5, 'alpha')];
    const b = [row('k', 5, 'beta')];
    expect(mergeById(a, b)[0].v).toBe(mergeById(b, a)[0].v);
  });
});

describe('stampChanged', () => {
  it('bumps an edit that would lose to the row it replaced', () => {
    const prev = [row('a', 100)];
    const next = [row('a', 40, 'edited')]; // a clock running behind
    expect(stampChanged(prev, next)[0].updatedAt).toBe(101);
  });

  it('leaves untouched rows and genuinely newer edits alone', () => {
    const prev = [row('a', 100), row('b', 100)];
    const edited = row('b', 150, 'edited');
    const out = stampChanged(prev, [prev[0], edited]);
    expect(out[0]).toBe(prev[0]);
    expect(out[1].updatedAt).toBe(150);
  });

  it('does not touch new rows', () => {
    expect(stampChanged([], [row('n', 3)])[0].updatedAt).toBe(3);
  });
});

const entry = (id: string, state: 'should' | 'want', from: number, to: number | null, updatedAt = 1): TimeEntry => ({
  id,
  state,
  startedAt: from,
  endedAt: to,
  updatedAt,
});

describe('repairEntries', () => {
  it('leaves a clean timeline alone', () => {
    const entries = [entry('a', 'should', 0, 10), entry('b', 'want', 10, null)];
    expect(repairEntries(entries)).toBe(entries);
  });

  it('a later start ends the running entry before it', () => {
    const out = repairEntries([entry('a', 'should', 0, null), entry('b', 'want', 30, null)]);
    expect(out.find((e) => e.id === 'a')).toMatchObject({ endedAt: 30 });
    expect(out.find((e) => e.id === 'b')).toMatchObject({ endedAt: null });
  });

  it('trims an entry that runs into the next', () => {
    const out = repairEntries([entry('a', 'should', 0, 50), entry('b', 'want', 30, 60)]);
    expect(out.find((e) => e.id === 'a')?.endedAt).toBe(30);
  });

  it('removes an entry that starts at the same instant as another', () => {
    const out = repairEntries([entry('a', 'should', 10, 20), entry('b', 'want', 10, 30)]);
    expect(out.filter((e) => e.deletedAt === undefined)).toHaveLength(1);
  });

  it('bumps repaired rows so they beat the stale copy', () => {
    const out = repairEntries([entry('a', 'should', 0, null, 5), entry('b', 'want', 30, null, 9)]);
    expect(out.find((e) => e.id === 'a')?.updatedAt).toBeGreaterThan(9);
  });

  it('gives the same answer whatever order the rows arrive in', () => {
    const rows = [entry('a', 'should', 0, null, 5), entry('b', 'want', 30, 40, 9), entry('c', 'should', 35, null, 7)];
    const sorted = (es: TimeEntry[]) => [...es].sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(sorted(repairEntries([...rows].reverse()))).toEqual(sorted(repairEntries(rows)));
  });

  it('is stable once repaired', () => {
    const once = repairEntries([entry('a', 'should', 0, null), entry('b', 'want', 30, null)]);
    expect(repairEntries(once)).toBe(once);
  });

  it('ignores tombstones', () => {
    const dead = { ...entry('a', 'should', 0, null), deletedAt: 5 };
    const entries = [dead, entry('b', 'want', 30, null)];
    expect(repairEntries(entries)).toBe(entries);
  });
});
