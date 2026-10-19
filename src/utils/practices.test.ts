import { describe, expect, it } from 'vitest';
import type { Practice, TimeEntry } from '../types';
import {
  countedSessions,
  describeLevel,
  describeSince,
  endedPractice,
  firstSessionAt,
  LEVEL_ORDER,
  LEVELS,
  levelFits,
  levelHint,
  levelOverBy,
  listPractices,
  makePractice,
  needsAttention,
  plannedMinutes,
  practiceSessions,
  practiceTime,
  removePractice,
  reorderPractices,
  setNextStep,
  updatePractice,
} from './practices';

const fields = {
  name: 'Guitar',
  level: 'steady' as const,
  smallStep: 'Play one scale',
  lowStep: 'Hold the guitar',
  smallNeeds: ['clarity' as const],
  lowNeeds: [],
};

const live = (ps: Practice[]) =>
  ps
    .filter((p) => p.deletedAt === undefined)
    .sort((a, b) => a.order - b.order)
    .map((p) => p.name);

function three(): Practice[] {
  let ps: Practice[] = [];
  for (const name of ['A', 'B', 'C']) ps = [...ps, makePractice(ps, { ...fields, name }, 1)];
  return ps;
}

describe('levels', () => {
  it('asks for more as the level goes up', () => {
    const order = ['paused', 'minimal', 'light', 'steady', 'serious'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(LEVELS[order[i]].sessions).toBeGreaterThanOrEqual(LEVELS[order[i - 1]].sessions);
      expect(LEVELS[order[i]].weekMin).toBeGreaterThan(LEVELS[order[i - 1]].weekMin);
    }
  });

  it('matches the decided table', () => {
    expect(LEVELS.paused).toMatchObject({ sessions: 0, minMin: 0, weekMin: 0 });
    expect(LEVELS.minimal).toMatchObject({ sessions: 1, minMin: 10, weekMin: 15 });
    expect(LEVELS.light).toMatchObject({ sessions: 3, minMin: 15, weekMin: 50 });
    expect(LEVELS.steady).toMatchObject({ sessions: 4, minMin: 20, weekMin: 90 });
    expect(LEVELS.serious).toMatchObject({ sessions: 6, minMin: 30, weekMin: 180 });
  });
});

describe('showing levels', () => {
  it('lists every level once, in the order of the table', () => {
    expect([...LEVEL_ORDER]).toEqual(Object.keys(LEVELS));
  });

  it('describes a level by its target', () => {
    expect(describeLevel('steady')).toBe('4× a week · 20 min');
    expect(describeLevel('minimal')).toBe('1× a week · 10 min');
    expect(describeLevel('paused')).toBe('Paused');
  });

  it('gives a short hint for a picker button', () => {
    expect(levelHint('serious')).toBe('6× · 30 min');
    expect(levelHint('paused')).toBe('No target');
  });
});

describe('listing practices', () => {
  it('puts live practices in order and Paused ones last, leaving out deleted ones', () => {
    const [a, b, c] = three();
    const out = listPractices([
      { ...a, level: 'paused' },
      { ...b, deletedAt: 5 },
      c,
      { ...makePractice([a, b, c], { ...fields, name: 'D' }, 1), level: 'light' },
    ]);
    expect(out.map((p) => p.name)).toEqual(['C', 'D', 'A']);
  });

  it('keeps the order among Paused ones', () => {
    const [a, b] = three();
    expect(
      listPractices([
        { ...b, level: 'paused' },
        { ...a, level: 'paused' },
      ]).map((p) => p.name),
    ).toEqual(['A', 'B']);
  });
});

describe('changing practices', () => {
  it('makes a practice with the fields, a fresh id and the next order', () => {
    const [a, b] = three();
    expect(a).toMatchObject({ ...fields, name: 'A', createdAt: 1, updatedAt: 1 });
    expect(a).not.toHaveProperty('nextStep');
    expect(b.order).toBeGreaterThan(a.order);
    expect(b.id).not.toBe(a.id);
  });

  it('edits fields and bumps updatedAt, leaving the others alone', () => {
    const ps = three();
    const out = updatePractice(ps, ps[1].id, { level: 'light', name: 'Bee' }, 9);
    expect(out[1]).toMatchObject({ level: 'light', name: 'Bee', updatedAt: 9, createdAt: 1 });
    expect(out[0]).toBe(ps[0]);
    expect(out[2]).toBe(ps[2]);
  });

  it('removes by tombstone, keeping the row', () => {
    const ps = three();
    const out = removePractice(ps, ps[0].id, 9);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ deletedAt: 9, updatedAt: 9 });
    expect(live(out)).toEqual(['B', 'C']);
  });

  it('sets the next step, trimmed, and clears it when blank', () => {
    const ps = three();
    const set = setNextStep(ps, ps[0].id, '  Learn the intro  ', 5);
    expect(set[0]).toMatchObject({ nextStep: 'Learn the intro', updatedAt: 5 });
    const cleared = setNextStep(set, ps[0].id, '   ', 6);
    expect(cleared[0].nextStep).toBeUndefined();
  });

  it('moves a practice to a position, changing only that row', () => {
    const ps = three();
    const first = reorderPractices(ps, ps[2].id, 0, 9);
    expect(live(first)).toEqual(['C', 'A', 'B']);
    expect(first[0]).toBe(ps[0]);
    expect(first[1]).toBe(ps[1]);
    expect(first[2].updatedAt).toBe(9);

    expect(live(reorderPractices(ps, ps[0].id, 1, 9))).toEqual(['B', 'A', 'C']);
    expect(live(reorderPractices(ps, ps[0].id, 99, 9))).toEqual(['B', 'C', 'A']);
  });

  it('ignores deleted practices when counting the position', () => {
    const [a, b, c] = three();
    const withGone = [{ ...a, deletedAt: 2 }, b, c];
    expect(live(reorderPractices(withGone, c.id, 0, 9))).toEqual(['C', 'B']);
  });

  it('a lone practice keeps a usable order', () => {
    const [a] = three();
    expect(reorderPractices([a], a.id, 0, 9)[0].order).toBe(1);
  });
});

// ── Weekly cap ────────────────────────────────────────────────────────────────

const withLevels = (levels: Practice['level'][]) =>
  levels.reduce<Practice[]>((ps, level, i) => [...ps, makePractice(ps, { ...fields, name: `P${i}`, level }, 1)], []);

describe('planned time', () => {
  it('adds the weekly minutes of every live practice', () => {
    expect(plannedMinutes(withLevels(['steady', 'light', 'minimal']))).toBe(90 + 50 + 15);
    expect(plannedMinutes([])).toBe(0);
  });

  it('counts a paused practice as nothing, and leaves out deleted ones', () => {
    const ps = withLevels(['serious', 'paused', 'steady']);
    expect(plannedMinutes(ps)).toBe(270);
    expect(plannedMinutes(removePractice(ps, ps[0].id, 5))).toBe(90);
  });
});

describe('fitting a level under the cap', () => {
  const ps = withLevels(['steady', 'light']); // 140 min

  it('fits anything with no cap', () => {
    expect(levelFits(ps, undefined, 'serious', null)).toBe(true);
    expect(levelOverBy(ps, undefined, 'serious', null)).toBe(0);
  });

  it('refuses a new practice at a level that would pass the cap, and says by how much', () => {
    expect(levelFits(ps, undefined, 'minimal', 180)).toBe(true); // 155
    expect(levelFits(ps, undefined, 'light', 180)).toBe(false); // 190
    expect(levelOverBy(ps, undefined, 'light', 180)).toBe(10);
    expect(levelOverBy(ps, undefined, 'serious', 180)).toBe(140);
  });

  it('fits a total exactly at the cap', () => {
    expect(levelFits(ps, undefined, 'light', 190)).toBe(true);
    expect(levelFits(ps, undefined, 'light', 189)).toBe(false);
  });

  it('counts a practice being edited at its new level, not its old one', () => {
    // Raising Light to Steady: 90 + 90 = 180.
    expect(levelFits(ps, ps[1].id, 'steady', 180)).toBe(true);
    expect(levelFits(ps, ps[1].id, 'steady', 179)).toBe(false);
    expect(levelOverBy(ps, ps[1].id, 'serious', 200)).toBe(70);
  });

  it('always allows a practice to keep or lower its level, even over the cap', () => {
    // 140 planned against a 120 cap: over, but working it down is allowed.
    expect(levelFits(ps, ps[0].id, 'steady', 120)).toBe(true);
    expect(levelFits(ps, ps[0].id, 'light', 120)).toBe(true);
    expect(levelFits(ps, ps[1].id, 'steady', 120)).toBe(false);
    expect(levelFits(ps, undefined, 'paused', 120)).toBe(true);
    expect(levelFits(ps, undefined, 'minimal', 120)).toBe(false);
  });

  it('ignores a deleted practice', () => {
    expect(levelFits(removePractice(ps, ps[0].id, 5), undefined, 'steady', 140)).toBe(true);
  });
});

// ── Sessions and time ─────────────────────────────────────────────────────────

const MIN = 60_000;
const T0 = new Date(2026, 9, 12, 10, 0).getTime();
const at = (min: number) => T0 + min * MIN;

let seq = 0;
function entry(state: TimeEntry['state'], from: number, to: number | null, practiceId?: string, extra: Partial<TimeEntry> = {}): TimeEntry {
  return { id: `e${seq++}`, state, startedAt: at(from), endedAt: to === null ? null : at(to), practiceId, updatedAt: 1, ...extra };
}
const timedEntry = (from: number, planned: number, to: number | null, practiceId?: string) =>
  entry('timed', from, to, practiceId, { plannedMs: planned * MIN });

const lengths = (entries: TimeEntry[], id: string, now = at(1000)) => practiceSessions(entries, id, now).map((s) => [(s.startedAt - T0) / MIN, s.ms / MIN]);

describe('practice sessions', () => {
  it('is one session for a Flow stretch split by Rest, counting only the Focus', () => {
    const entries = [entry('should', 0, 25, 'g'), entry('want', 25, 30, 'g'), entry('should', 30, 40, 'g')];
    expect(lengths(entries, 'g')).toEqual([[0, 35]]);
  });

  it('splits on a gap', () => {
    const entries = [entry('should', 0, 25, 'g'), entry('should', 26, 40, 'g')];
    expect(lengths(entries, 'g')).toEqual([
      [0, 25],
      [26, 14],
    ]);
  });

  it('splits when another practice, or none, comes between', () => {
    const entries = [entry('should', 0, 20, 'g'), entry('should', 20, 40, 'd'), entry('should', 40, 60, 'g')];
    expect(lengths(entries, 'g')).toEqual([
      [0, 20],
      [40, 20],
    ]);
    expect(lengths(entries, 'd')).toEqual([[20, 20]]);
    expect(lengths([entry('should', 0, 20, 'g'), entry('should', 20, 40), entry('should', 40, 60, 'g')], 'g')).toEqual([
      [0, 20],
      [40, 20],
    ]);
  });

  it('leaves out time that is all Rest', () => {
    expect(lengths([entry('want', 0, 30, 'g')], 'g')).toEqual([]);
  });

  it('counts a Timed session that ended early by its real length', () => {
    expect(lengths([timedEntry(0, 30, 12, 'g')], 'g')).toEqual([[0, 12]]);
  });

  it('never counts a Timed session past its planned length', () => {
    expect(lengths([timedEntry(0, 20, null, 'g')], 'g', at(90))).toEqual([[0, 20]]);
    expect(lengths([timedEntry(0, 20, 45, 'g')], 'g')).toEqual([[0, 20]]);
  });

  it('keeps a Timed session apart from a Flow stretch next to it', () => {
    const entries = [entry('should', 0, 20, 'g'), timedEntry(20, 15, 35, 'g'), entry('should', 35, 50, 'g')];
    expect(lengths(entries, 'g')).toEqual([
      [0, 20],
      [20, 15],
      [35, 15],
    ]);
  });

  it('counts a running entry up to now', () => {
    expect(lengths([entry('should', 0, null, 'g')], 'g', at(18))).toEqual([[0, 18]]);
  });

  it('ignores deleted entries and other practices, and sorts oldest first', () => {
    const entries = [entry('should', 60, 80, 'g'), entry('should', 0, 30, 'g', { deletedAt: 5 }), entry('should', 100, 120, 'd'), entry('should', 10, 40, 'g')];
    expect(lengths(entries, 'g')).toEqual([
      [10, 30],
      [60, 20],
    ]);
  });
});

describe('practice time', () => {
  const win = { start: at(0), end: at(100) };

  it('adds Focus and Timed, leaving Rest out', () => {
    const entries = [entry('should', 0, 25, 'g'), entry('want', 25, 30, 'g'), timedEntry(30, 20, 50, 'g')];
    expect(practiceTime(entries, 'g', win, at(200))).toBe(45 * MIN);
  });

  it('clips entries to the window', () => {
    const entries = [entry('should', -30, 10, 'g'), entry('should', 90, 130, 'g')];
    expect(practiceTime(entries, 'g', win, at(200))).toBe(20 * MIN);
  });

  it('counts a running entry up to now, and ignores other practices and deleted entries', () => {
    const entries = [entry('should', 0, null, 'g'), entry('should', 0, 50, 'd'), entry('should', 0, 50, 'g', { deletedAt: 3 })];
    expect(practiceTime(entries, 'g', win, at(15))).toBe(15 * MIN);
  });
});

describe('first session', () => {
  it('is the earliest Focus or Timed start, ignoring Rest, deleted and others', () => {
    const entries = [
      entry('want', 0, 10, 'g'),
      entry('should', 5, 20, 'g', { deletedAt: 1 }),
      entry('should', 2, 8, 'd'),
      timedEntry(40, 20, 60, 'g'),
      entry('should', 70, 80, 'g'),
    ];
    expect(firstSessionAt(entries, 'g')).toBe(at(40));
  });

  it('is undefined with no time', () => {
    expect(firstSessionAt([entry('want', 0, 10, 'g')], 'g')).toBeUndefined();
    expect(firstSessionAt([], 'g')).toBeUndefined();
  });
});

describe('since', () => {
  const month = (y: number, m: number) => new Date(y, m, 15).toLocaleDateString(undefined, { month: 'long' });

  it('names the month of the first session', () => {
    expect(describeSince(new Date(2026, 5, 3).getTime(), at(0))).toBe(`since ${month(2026, 5)}`);
  });

  it('adds the year when it was another one', () => {
    expect(describeSince(new Date(2025, 5, 3).getTime(), at(0))).toBe(`since ${month(2025, 5)} 2025`);
  });
});

describe('a practice session ending', () => {
  const was = (e: TimeEntry) => ({ id: e.id, practiceId: e.practiceId ?? '' });

  it('is the practice once its running entry has been closed', () => {
    const e = entry('should', 0, 25, 'g');
    expect(endedPractice([e], was(e), at(25))).toBe('g');
    expect(endedPractice([e], was(e), at(30))).toBe('g');
  });

  it('is nothing while it still runs, or with nothing to compare', () => {
    const e = entry('should', 0, null, 'g');
    expect(endedPractice([e], was(e), at(25))).toBeUndefined();
    expect(endedPractice([entry('should', 0, 25, 'g')], null, at(25))).toBeUndefined();
  });

  it('is nothing when Flow moves from Focus to Rest for the same practice', () => {
    const focus = entry('should', 0, 25, 'g');
    const rest = entry('want', 25, null, 'g');
    expect(endedPractice([focus, rest], was(focus), at(26))).toBeUndefined();
  });

  it('is the practice when another practice, or none, takes over', () => {
    const g = entry('should', 0, 25, 'g');
    expect(endedPractice([g, entry('should', 25, null, 'd')], was(g), at(26))).toBe('g');
    expect(endedPractice([g, entry('should', 25, null)], was(g), at(26))).toBe('g');
  });

  it('is a Timed session settled at its planned end, if that was under ten minutes ago', () => {
    const e = timedEntry(0, 20, 20, 'g');
    expect(endedPractice([e], was(e), at(29))).toBe('g');
    expect(endedPractice([e], was(e), at(31))).toBeUndefined();
  });

  it('is nothing for an entry that was removed', () => {
    const e = entry('should', 0, 25, 'g', { deletedAt: 25 });
    expect(endedPractice([e], was(e), at(25))).toBeUndefined();
    expect(endedPractice([], was(e), at(25))).toBeUndefined();
  });
});

// ── Needs attention ───────────────────────────────────────────────────────────

describe('needs attention', () => {
  const DAY = 24 * 60;
  /** A Timed session of `min` minutes, `day` days after Monday 12 Oct at 10:00. */
  const sit = (practiceId: string, day: number, min: number) => timedEntry(day * DAY, min, day * DAY + min, practiceId);
  /** A moment `day` days after Monday 10:00 plus `min` minutes: day 4 is Friday. */
  const when = (day: number, min = 0) => at(day * DAY + min);
  const named = (level: Practice['level'], name: string, order = 1): Practice => ({
    ...makePractice([], { ...fields, name, level }, 1),
    id: name,
    order,
  });
  const names = (out: ReturnType<typeof needsAttention>) => out.map((a) => a.practice.name);

  const guitar = named('steady', 'Guitar'); // 4 a week, from 20 min
  const drawing = named('light', 'Drawing', 2); // 3 a week, from 15 min
  const spanish = named('minimal', 'Spanish', 3); // 1 a week, from 10 min

  it('counts only sessions that began this week and reached the level minimum', () => {
    const week = { start: when(0, -600), end: when(7, -600) };
    const entries = [sit('Guitar', 0, 20), sit('Guitar', 1, 19), sit('Guitar', -1, 30), sit('Guitar', 7, 30), sit('Drawing', 1, 40)];
    expect(countedSessions(entries, guitar, week, when(2)).map((s) => s.ms / MIN)).toEqual([20]);
  });

  it('lists what is behind, with the sessions left and the days left', () => {
    const out = needsAttention([guitar, drawing], [sit('Guitar', 0, 30)], when(0, 60), 0);
    expect(out.map((a) => [a.practice.name, a.done, a.left, a.daysLeft])).toEqual([
      ['Drawing', 0, 3, 7],
      ['Guitar', 1, 3, 7],
    ]);
  });

  it('ranks by sessions left, the same days left for all, on a Monday and on a Friday', () => {
    const entries = [sit('Guitar', 0, 30), sit('Guitar', 1, 30), sit('Spanish', 0, 15)];
    // Monday: Drawing 3 left, Guitar 2 left, Spanish met its one.
    expect(names(needsAttention([guitar, drawing, spanish], entries, when(0, 600), 0))).toEqual(['Drawing', 'Guitar']);
    // Friday: three days left (Fri, Sat, Sun).
    const friday = needsAttention([guitar, drawing, spanish], entries, when(4, 60), 0);
    expect(names(friday)).toEqual(['Drawing', 'Guitar']);
    expect(friday.map((a) => a.daysLeft)).toEqual([3, 3]);
    // Sunday: one day left.
    expect(needsAttention([guitar], [], when(6, 60), 0)[0].daysLeft).toBe(1);
  });

  it('leaves out paused and deleted practices and ones that met their target', () => {
    const entries = [sit('Spanish', 2, 10)];
    const paused = named('paused', 'Paused', 4);
    const gone = { ...named('steady', 'Gone', 5), deletedAt: 9 };
    expect(names(needsAttention([guitar, spanish, paused, gone], entries, when(3), 0))).toEqual(['Guitar']);
  });

  it('does not count a session shorter than the minimum', () => {
    const entries = [sit('Spanish', 1, 9), sit('Guitar', 1, 19)];
    const out = needsAttention([guitar, spanish], entries, when(3), 0);
    expect(out.map((a) => [a.practice.name, a.done])).toEqual([
      ['Guitar', 0],
      ['Spanish', 0],
    ]);
  });

  it('counts a Flow session by its Focus time', () => {
    const entries = [entry('should', 0, 12, 'Spanish'), entry('want', 12, 30, 'Spanish')];
    expect(names(needsAttention([spanish], entries, at(60), 0))).toEqual([]);
    const short = [entry('should', 0, 8, 'Spanish'), entry('want', 8, 30, 'Spanish')];
    expect(names(needsAttention([spanish], short, at(60), 0))).toEqual(['Spanish']);
  });

  it("does not count last week's sessions", () => {
    const entries = [sit('Spanish', -2, 30)];
    expect(names(needsAttention([spanish], entries, when(0, 60), 0))).toEqual(['Spanish']);
  });

  it('breaks a tie by the oldest last session, a practice never done first', () => {
    const a = named('light', 'A', 1);
    const b = named('light', 'B', 2);
    const c = named('light', 'C', 3);
    // All three have 3 sessions left of 3, so a short one (not counted) decides.
    const entries = [sit('A', 2, 5), sit('B', 1, 5)];
    expect(names(needsAttention([a, b, c], entries, when(3), 0))).toEqual(['C', 'B', 'A']);
  });

  it('falls back to the list order on a full tie', () => {
    const a = named('light', 'A', 2);
    const b = named('light', 'B', 1);
    expect(names(needsAttention([a, b], [], when(1), 0))).toEqual(['B', 'A']);
  });

  it('follows the day end hour: 1 AM Monday is still last week', () => {
    const monday1am = new Date(2026, 9, 19, 1, 0).getTime();
    expect(needsAttention([guitar], [], monday1am, 3)[0].daysLeft).toBe(1);
    expect(needsAttention([guitar], [], monday1am, 0)[0].daysLeft).toBe(7);
  });
});
