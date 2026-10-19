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

  it('adds the practices cursors to a version 1 state, keeping the others', () => {
    expect(migrateSyncMeta(v1, 1)).toEqual({
      userId: 'u1',
      cursors: {
        pushed: { entries: 5, items: 6, practices: 0, settings: 7 },
        pulled: { entries: '10', items: '11', practices: null, settings: '12' },
      },
    });
  });

  it('leaves a current state as it is', () => {
    const v2 = migrateSyncMeta(v1, 1);
    expect(migrateSyncMeta(v2, 2)).toBe(v2);
  });
});
