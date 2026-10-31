import { describe, expect, it } from 'vitest';
import { migrateSyncMeta } from './status';

describe('sync meta migration', () => {
  const v5 = {
    userId: 'u1',
    cursors: {
      pushed: { entries: 5, items: 6, practices: 8, getReadyDays: 9, settings: 7 },
      pulled: { entries: '10', items: '11', practices: '13', getReadyDays: '14', settings: '12' },
    },
  };
  const current = {
    userId: 'u1',
    cursors: {
      pushed: { entries: 5, items: 6, settings: 7 },
      pulled: { entries: '10', items: '11', settings: '12' },
    },
  };

  it('drops the practices and Get ready cursors and keeps the others', () => {
    expect(migrateSyncMeta(v5, 5)).toEqual(current);
  });

  it('does the same for a version 1 state that has neither table', () => {
    expect(migrateSyncMeta(current, 1)).toEqual(current);
  });

  it('is safe to run twice', () => {
    expect(migrateSyncMeta(migrateSyncMeta(v5, 5), 5)).toEqual(current);
  });

  it('leaves a current state as it is', () => {
    expect(migrateSyncMeta(current, 6)).toBe(current);
  });
});
