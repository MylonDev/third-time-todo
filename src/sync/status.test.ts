import { describe, expect, it } from 'vitest';
import { migrateSyncMeta } from './status';

describe('sync meta migration', () => {
  const v1 = {
    userId: 'u1',
    cursors: {
      pushed: { entries: 5, items: 6, settings: 7 },
      pulled: { entries: '10', items: '11', settings: '12' },
    },
  };

  const v2 = {
    userId: 'u1',
    cursors: {
      pushed: { entries: 5, items: 6, practices: 8, settings: 7 },
      pulled: { entries: '10', items: '11', practices: '13', settings: '12' },
    },
  };

  it('brings a version 1 state up to date, keeping the others and starting the new tables from zero', () => {
    expect(migrateSyncMeta(v1, 1)).toEqual({
      userId: 'u1',
      cursors: {
        pushed: { entries: 5, items: 6, practices: 0, getReadyDays: 0, settings: 7 },
        pulled: { entries: '10', items: '11', practices: null, getReadyDays: null, settings: '12' },
      },
    });
  });

  const v3 = {
    userId: 'u1',
    cursors: {
      pushed: { entries: 5, items: 6, practices: 8, getReadyDays: 9, settings: 7 },
      pulled: { entries: '10', items: '11', practices: '13', getReadyDays: '14', settings: '12' },
    },
  };

  it('adds the Get ready cursors to a version 2 state, and pulls the practices again', () => {
    expect(migrateSyncMeta(v2, 2)).toEqual({
      userId: 'u1',
      cursors: {
        pushed: { entries: 5, items: 6, practices: 8, getReadyDays: 0, settings: 7 },
        pulled: { entries: '10', items: '11', practices: null, getReadyDays: null, settings: '12' },
      },
    });
  });

  it('sends the practices of a version 3 state back to the start of the pull, and nothing else', () => {
    // A device that pulled a row after a newer build wrote it never read its target columns.
    expect(migrateSyncMeta(v3, 3)).toEqual({
      userId: 'u1',
      cursors: {
        pushed: { entries: 5, items: 6, practices: 8, getReadyDays: 9, settings: 7 },
        pulled: { entries: '10', items: '11', practices: null, getReadyDays: '14', settings: '12' },
      },
    });
  });

  it('leaves a current state as it is', () => {
    const v4 = migrateSyncMeta(v3, 3);
    expect(migrateSyncMeta(v4, 4)).toBe(v4);
  });
});
