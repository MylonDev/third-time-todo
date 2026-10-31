import { describe, expect, it } from 'vitest';
import type { Item, TimeEntry } from '../types';
import { entryToRow, itemToRow, rowToEntry, rowToItem, rowToSettings, settingsToRow } from './rows';

describe('row mapping', () => {
  it('round-trips an open entry', () => {
    const e: TimeEntry = { id: 'u', state: 'want', startedAt: 10, endedAt: null, updatedAt: 11 };
    expect(rowToEntry(entryToRow(e))).toEqual(e);
  });

  it('round-trips a Timed entry with its planned length', () => {
    const e: TimeEntry = { id: 'u', state: 'timed', startedAt: 10, endedAt: 610, plannedMs: 600, updatedAt: 11 };
    const row = entryToRow(e);
    expect(row).toMatchObject({ state: 'timed', planned_ms: 600 });
    expect(rowToEntry(row)).toEqual(e);
  });

  it('leaves planned_ms off a Flow entry, so it syncs with or without the column', () => {
    const row = entryToRow({ id: 'u', state: 'want', startedAt: 1, endedAt: null, updatedAt: 2 });
    expect('planned_ms' in row).toBe(false);
  });

  it('reads a null planned_ms as none', () => {
    const row = { ...entryToRow({ id: 'u', state: 'want', startedAt: 1, endedAt: null, updatedAt: 2 }), planned_ms: null };
    expect(rowToEntry(row)).not.toHaveProperty('plannedMs');
  });

  it('ignores a practice_id still present on a pulled row', () => {
    const row = { ...entryToRow({ id: 'u', state: 'should', startedAt: 1, endedAt: 5, updatedAt: 9 }), practice_id: 'guitar' };
    expect(rowToEntry(row)).toEqual({ id: 'u', state: 'should', startedAt: 1, endedAt: 5, updatedAt: 9 });
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
    expect(settingsToRow(s)).toEqual({ day_end_hour: 3, should_target_min: 240, updated_at: 7 });
    expect(rowToSettings(settingsToRow(s))).toEqual(s);
  });

  it('round-trips settings with no target', () => {
    const s = { dayEndHour: 0, shouldTargetMin: null, updatedAt: 7 };
    expect(rowToSettings(settingsToRow(s))).toEqual(s);
  });

  it('ignores columns a settings row still carries, and reads a bigint string as a number', () => {
    const row = {
      day_end_hour: 2,
      should_target_min: null,
      weekly_cap_min: 480,
      get_ready_steps: [{ id: 'w', text: 'Water' }],
      get_ready_steps_updated_at: 5,
      updated_at: '1760000000000' as unknown as number,
    };
    expect(rowToSettings(row)).toEqual({ dayEndHour: 2, shouldTargetMin: null, updatedAt: 1760000000000 });
  });
});
