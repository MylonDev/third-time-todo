import { describe, expect, it } from 'vitest';
import type { Item, TimeEntry } from '../types';
import { entryToRow, itemToRow, rowToEntry, rowToItem, rowToSettings, settingsToRow } from './rows';

describe('row mapping', () => {
  it('round-trips an open entry', () => {
    const e: TimeEntry = { id: 'u', state: 'want', startedAt: 10, endedAt: null, updatedAt: 11 };
    expect(rowToEntry(entryToRow(e))).toEqual(e);
  });

  it('round-trips a tombstoned entry', () => {
    const e: TimeEntry = { id: 'u', state: 'should', startedAt: 1, endedAt: 5, updatedAt: 9, deletedAt: 9 };
    expect(rowToEntry(entryToRow(e))).toEqual(e);
  });

  it('round-trips a repeating, completed item with every optional field', () => {
    const i: Item = {
      id: 's:2026-10-12',
      text: 'Stretch',
      kind: 'should',
      dueOn: '2026-10-12',
      done: true,
      doneAt: 123,
      repeat: { kind: 'weekdays', days: [0, 2] },
      seriesId: 's',
      nextId: 's:2026-10-14',
      order: 4,
      updatedAt: 200,
    };
    expect(rowToItem(itemToRow(i))).toEqual(i);
  });

  it('round-trips a bare item', () => {
    const i: Item = { id: 'x', text: 't', kind: 'want', dueOn: null, done: false, order: 1, updatedAt: 2 };
    expect(rowToItem(itemToRow(i))).toEqual(i);
  });

  it('reads bigint strings as numbers', () => {
    const row = { ...entryToRow({ id: 'u', state: 'should', startedAt: 1, endedAt: 2, updatedAt: 3 }) };
    const e = rowToEntry({ ...row, started_at: '1760000000000' as unknown as number, updated_at: '3' as unknown as number });
    expect(e.startedAt).toBe(1760000000000);
    expect(e.updatedAt).toBe(3);
  });

  it('round-trips settings', () => {
    const s = { dayEndHour: 3, shouldTargetMin: 240, updatedAt: 7 };
    expect(rowToSettings(settingsToRow(s))).toEqual(s);
  });
});
