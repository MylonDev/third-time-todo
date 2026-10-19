import { describe, expect, it } from 'vitest';
import { mergeById } from '../sync/merge';
import { rowToPractice, type PracticeRow } from '../sync/rows';
import type { Practice } from '../types';
import { migratePractices } from './practices';

/** A practice as version 1 stored it. */
const v1 = (level: unknown, extra: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Guitar',
  level,
  smallStep: 'Play one scale',
  lowStep: 'Hold the guitar',
  smallNeeds: ['clarity'],
  lowNeeds: [],
  order: 2,
  createdAt: 100,
  updatedAt: 200,
  ...extra,
});

const migrate = (...practices: Record<string, unknown>[]) => migratePractices({ practices }, 1).practices;

describe('moving the stored practices from version 1 to 2', () => {
  it('turns each level into the target it stood for', () => {
    const targets = (['paused', 'minimal', 'light', 'steady', 'serious'] as const).map((l) => {
      const [p] = migrate(v1(l));
      return [l, p.targetDays, p.targetMin];
    });
    expect(targets).toEqual([
      ['paused', 0, 0],
      ['minimal', 1, 10],
      ['light', 3, 15],
      ['steady', 4, 20],
      ['serious', 6, 30],
    ]);
  });

  it('starts with no chosen weekdays', () => {
    expect(migrate(v1('light'))[0].targetWeekdays).toEqual([]);
  });

  it('reads an unknown, missing or inherited level as Paused', () => {
    for (const level of ['legendary', undefined, null, 3, 'constructor', 'toString']) {
      expect(migrate(v1(level))[0]).toMatchObject({ targetDays: 0, targetWeekdays: [], targetMin: 0 });
    }
  });

  it('drops the removed fields and keeps the rest as it was', () => {
    const [p] = migrate(v1('steady', { nextStep: 'Learn the intro' }));
    expect(p).toEqual({
      id: 'p1',
      name: 'Guitar',
      targetDays: 4,
      targetWeekdays: [],
      targetMin: 20,
      nextStep: 'Learn the intro',
      order: 2,
      createdAt: 100,
      updatedAt: 200,
    });
    for (const gone of ['level', 'smallStep', 'lowStep', 'smallNeeds', 'lowNeeds']) expect(p).not.toHaveProperty(gone);
  });

  it('keeps a tombstone', () => {
    const [p] = migrate(v1('serious', { deletedAt: 300, updatedAt: 300 }));
    expect(p).toMatchObject({ deletedAt: 300, updatedAt: 300, targetDays: 6, targetMin: 30 });
  });

  it('migrates every practice and an empty or damaged store', () => {
    expect(migrate(v1('light', { id: 'a' }), v1('steady', { id: 'b' })).map((p) => [p.id, p.targetDays])).toEqual([
      ['a', 3],
      ['b', 4],
    ]);
    expect(migratePractices({ practices: [] }, 1)).toEqual({ practices: [] });
    expect(migratePractices({}, 1)).toEqual({ practices: [] });
    expect(migratePractices(null, 1)).toEqual({ practices: [] });
  });

  it('leaves a version 2 store alone', () => {
    const state = { practices: [{ id: 'p', name: 'n', targetDays: 2, targetWeekdays: [1], targetMin: 5, order: 1, createdAt: 1, updatedAt: 1 }] };
    expect(migratePractices(state, 2)).toEqual(state);
  });

  it('converges with the row the server backfills from the same level', () => {
    // What the migration SQL writes for a steady practice: the old columns, plus the new ones, and updated_at as it was.
    const backfilled: PracticeRow & Record<string, unknown> = {
      id: 'p1',
      name: 'Guitar',
      level: 'steady',
      small_step: 'Play one scale',
      low_step: 'Hold the guitar',
      small_needs: ['clarity'],
      low_needs: [],
      target_days: 4,
      target_weekdays: [],
      target_min: 20,
      next_step: null,
      sort_order: 2,
      created_at: 100,
      updated_at: 200,
      deleted_at: null,
    };
    const pulled = rowToPractice(backfilled);
    const [migrated] = migrate(v1('steady'));
    expect(pulled).toEqual(migrated);
    // Merging the pulled row into the migrated local one changes nothing that matters.
    const merged: Practice[] = mergeById([migrated], [pulled]);
    expect(merged).toEqual([migrated]);
  });
});
