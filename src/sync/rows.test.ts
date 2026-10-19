import { describe, expect, it } from 'vitest';
import type { Item, Practice, TimeEntry } from '../types';
import {
  entryToRow,
  itemToRow,
  practiceToRow,
  rowToEntry,
  rowToItem,
  rowToPractice,
  rowToSettings,
  settingsToRow,
} from './rows';

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

  it('round-trips an entry for a practice', () => {
    const e: TimeEntry = { id: 'u', state: 'should', startedAt: 1, endedAt: 5, practiceId: 'guitar', updatedAt: 9 };
    const row = entryToRow(e);
    expect(row).toMatchObject({ practice_id: 'guitar' });
    expect(rowToEntry(row)).toEqual(e);
  });

  it('leaves practice_id off an entry with no practice, so it syncs with or without the column', () => {
    const row = entryToRow({ id: 'u', state: 'should', startedAt: 1, endedAt: null, updatedAt: 2 });
    expect('practice_id' in row).toBe(false);
  });

  it('reads a null practice_id as none', () => {
    const row = { ...entryToRow({ id: 'u', state: 'should', startedAt: 1, endedAt: null, updatedAt: 2 }), practice_id: null };
    expect(rowToEntry(row)).not.toHaveProperty('practiceId');
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

  it('round-trips a practice with every optional field', () => {
    const p: Practice = {
      id: 'p1',
      name: 'Guitar',
      level: 'steady',
      smallStep: 'Play one scale',
      lowStep: 'Hold the guitar',
      smallNeeds: ['clarity', 'energy'],
      lowNeeds: [],
      nextStep: 'Learn the intro',
      order: 2.5,
      createdAt: 100,
      updatedAt: 200,
      deletedAt: 300,
    };
    const row = practiceToRow(p);
    expect(row).toMatchObject({ small_needs: ['clarity', 'energy'], low_needs: [], next_step: 'Learn the intro', sort_order: 2.5 });
    expect(rowToPractice(row)).toEqual(p);
  });

  it('round-trips a bare practice', () => {
    const p: Practice = {
      id: 'p2',
      name: 'Art',
      level: 'paused',
      smallStep: '',
      lowStep: '',
      smallNeeds: [],
      lowNeeds: [],
      order: 1,
      createdAt: 1,
      updatedAt: 2,
    };
    const back = rowToPractice(practiceToRow(p));
    expect(back).toEqual(p);
    expect(back).not.toHaveProperty('nextStep');
    expect(back).not.toHaveProperty('deletedAt');
  });

  it('reads bigint strings in a practice as numbers', () => {
    const base = practiceToRow({
      id: 'p',
      name: 'n',
      level: 'light',
      smallStep: '',
      lowStep: '',
      smallNeeds: [],
      lowNeeds: [],
      order: 1,
      createdAt: 1,
      updatedAt: 2,
    });
    const p = rowToPractice({ ...base, created_at: '1760000000000' as unknown as number, updated_at: '5' as unknown as number });
    expect(p.createdAt).toBe(1760000000000);
    expect(p.updatedAt).toBe(5);
  });

  it('round-trips settings', () => {
    const s = { dayEndHour: 3, shouldTargetMin: 240, weeklyCapMin: 480, updatedAt: 7 };
    expect(settingsToRow(s)).toMatchObject({ weekly_cap_min: 480 });
    expect(rowToSettings(settingsToRow(s))).toEqual(s);
  });

  it('round-trips settings with no cap, and reads a row without the column as no cap', () => {
    const s = { dayEndHour: 0, shouldTargetMin: null, weeklyCapMin: null, updatedAt: 7 };
    expect(rowToSettings(settingsToRow(s))).toEqual(s);
    expect(rowToSettings({ day_end_hour: 0, should_target_min: null, updated_at: 7 }).weeklyCapMin).toBeNull();
  });
});
