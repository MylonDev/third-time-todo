import { describe, expect, it } from 'vitest';
import { splitSessionLog, migrateSessionV3 } from './sessionMigrate';

const MIN = 60_000;
const T = 1_700_000_000_000;

describe('splitSessionLog', () => {
  it('splits one log into a work entry then the break that followed it', () => {
    const [work, brk] = splitSessionLog({
      id: 'a', workMs: 50 * MIN, breakMs: 10 * MIN, mode: 'third', startedAt: T,
    });
    expect(work).toMatchObject({ kind: 'work', startedAt: T, endedAt: T + 50 * MIN, mode: 'third' });
    expect(brk).toMatchObject({ kind: 'break', startedAt: T + 50 * MIN, endedAt: T + 60 * MIN });
  });

  it('drops a zero-length half', () => {
    expect(splitSessionLog({ id: 'a', workMs: 30 * MIN, breakMs: 0, mode: 'half', startedAt: T }))
      .toHaveLength(1);
    expect(splitSessionLog({ id: 'a', workMs: 0, breakMs: 5 * MIN, mode: 'half', startedAt: T }))
      .toHaveLength(1);
    expect(splitSessionLog({ id: 'a', workMs: 0, breakMs: 0, mode: 'half', startedAt: T }))
      .toHaveLength(0);
  });

  it('gives every entry its own id', () => {
    const [a, b] = splitSessionLog({ id: 'a', workMs: MIN, breakMs: MIN, mode: 'third', startedAt: T });
    expect(a.id).not.toBe(b.id);
  });

  it('preserves total time exactly', () => {
    const log = { id: 'a', workMs: 37 * MIN, breakMs: 13 * MIN, mode: 'quarter' as const, startedAt: T };
    const entries = splitSessionLog(log);
    const total = entries.reduce((a, e) => a + (e.endedAt - e.startedAt), 0);
    expect(total).toBe(50 * MIN);
  });
});

describe('migrateSessionV3', () => {
  const v3 = {
    daily: {
      date: '2026-09-20',
      bankMs: 12 * MIN,
      unusedRestMs: 3 * MIN,
      sessionStartedAt: T,
      sessions: [{ id: 's1', workMs: 60 * MIN, breakMs: 20 * MIN, mode: 'third', startedAt: T }],
    },
    history: [
      {
        date: '2026-09-19',
        totalWorkMs: 90 * MIN,
        totalBreakMs: 30 * MIN,
        unusedRestMs: 5 * MIN,
        sessions: [{ id: 's0', workMs: 90 * MIN, breakMs: 30 * MIN, mode: 'half', startedAt: T - 86_400_000 }],
      },
    ],
  };

  it('converts today\'s sessions into entries', () => {
    const out = migrateSessionV3(v3);
    expect(out.daily.entries).toHaveLength(2);
    expect(out.daily.entries[0].kind).toBe('work');
    expect(out.daily.entries[1].kind).toBe('break');
  });

  it('drops the stored bank — it is derived now', () => {
    const out = migrateSessionV3(v3);
    expect(out.daily).not.toHaveProperty('bankMs');
    expect(out.daily).not.toHaveProperty('sessionStartedAt');
  });

  it('converts archived days and leaves their totals alone', () => {
    const out = migrateSessionV3(v3);
    expect(out.history[0].entries).toHaveLength(2);
    expect(out.history[0].totalWorkMs).toBe(90 * MIN);
    expect(out.history[0].unusedRestMs).toBe(5 * MIN);
  });

  it('survives a store that has no sessions at all', () => {
    const out = migrateSessionV3({ daily: { date: '2026-09-20', bankMs: 0, sessions: [] }, history: [] });
    expect(out.daily.entries).toEqual([]);
    expect(out.history).toEqual([]);
  });

  it('survives a store with nothing in it', () => {
    const out = migrateSessionV3({});
    expect(out.daily.entries).toEqual([]);
    expect(out.history).toEqual([]);
  });
});
