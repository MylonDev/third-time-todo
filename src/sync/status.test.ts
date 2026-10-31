import { describe, expect, it } from 'vitest';
import { migrateSyncMeta } from './status';

describe('sync meta migration', () => {
  const old = {
    userId: 'u1',
    cursors: {
      pushed: { entries: 5, items: 6, practices: 8, getReadyDays: 9, settings: 7 },
      pulled: { entries: '10', items: '11', practices: '13', getReadyDays: '14', settings: '12' },
    },
  };

  it('drops the practices and Get ready cursors, resets the pushed settings, and keeps the rest', () => {
    expect(migrateSyncMeta(old)).toEqual({
      userId: 'u1',
      cursors: {
        pushed: { entries: 5, items: 6, settings: 0 },
        pulled: { entries: '10', items: '11', settings: '12' },
      },
    });
  });

  it('handles a state that has neither table', () => {
    const bare = { userId: null, cursors: { pushed: { entries: 1, items: 2, settings: 3 }, pulled: { entries: null, items: null, settings: null } } };
    expect(migrateSyncMeta(bare)).toEqual({
      userId: null,
      cursors: { pushed: { entries: 1, items: 2, settings: 0 }, pulled: { entries: null, items: null, settings: null } },
    });
  });

  it('is safe to run twice', () => {
    expect(migrateSyncMeta(migrateSyncMeta(old))).toEqual(migrateSyncMeta(old));
  });
});
