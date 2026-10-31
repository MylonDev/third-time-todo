import { describe, expect, it } from 'vitest';
import { migrateLedger } from './timer';

describe('migrateLedger', () => {
  const v1 = {
    entries: [
      { id: 'a', state: 'should', startedAt: 1, endedAt: 5, practiceId: 'guitar', updatedAt: 9 },
      { id: 'b', state: 'want', startedAt: 5, endedAt: null, updatedAt: 11 },
      { id: 'c', state: 'timed', startedAt: 20, endedAt: 80, plannedMs: 60, practiceId: 'art', updatedAt: 12, deletedAt: 12 },
    ],
  };

  it('strips practiceId from every entry and keeps updatedAt', () => {
    expect(migrateLedger(v1)).toEqual({
      entries: [
        { id: 'a', state: 'should', startedAt: 1, endedAt: 5, updatedAt: 9 },
        { id: 'b', state: 'want', startedAt: 5, endedAt: null, updatedAt: 11 },
        { id: 'c', state: 'timed', startedAt: 20, endedAt: 80, plannedMs: 60, updatedAt: 12, deletedAt: 12 },
      ],
    });
  });

  it('is safe to run twice', () => {
    const once = migrateLedger(v1);
    expect(migrateLedger(once)).toEqual(once);
  });
});
