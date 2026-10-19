import { describe, expect, it } from 'vitest';
import type { Practice, TimeEntry } from '../types';
import {
  countedDays,
  describeSince,
  describeTarget,
  endedPractice,
  firstSessionAt,
  isPaused,
  listPractices,
  makePractice,
  needsAttention,
  plannedMinutes,
  practiceTime,
  removePractice,
  reorderPractices,
  setNextStep,
  targetFits,
  targetHint,
  targetOf,
  targetOverBy,
  TEMPLATE_ORDER,
  TEMPLATES,
  templateOf,
  updatePractice,
  weekCost,
  weekTotals,
  type Target,
  type TemplateKey,
} from './practices';
import { dayKeyOf, weekWindowOf } from './time';

const fields = { name: 'Guitar', targetDays: 4, targetWeekdays: [] as number[], targetMin: 20 };

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

const paused = { targetDays: 0, targetWeekdays: [], targetMin: 0 };

describe('templates', () => {
  it('match the decided table', () => {
    expect(TEMPLATES.paused).toMatchObject({ days: 0, minutes: 0 });
    expect(TEMPLATES.minimal).toMatchObject({ days: 1, minutes: 10 });
    expect(TEMPLATES.light).toMatchObject({ days: 3, minutes: 15 });
    expect(TEMPLATES.steady).toMatchObject({ days: 4, minutes: 20 });
    expect(TEMPLATES.serious).toMatchObject({ days: 6, minutes: 30 });
  });

  it('cost 0, 10, 45, 80 and 180 minutes a week, more at each step up', () => {
    expect(TEMPLATE_ORDER.map((t) => weekCost(targetOf(t)))).toEqual([0, 10, 45, 80, 180]);
  });

  it('are listed once, in the order of the table', () => {
    expect([...TEMPLATE_ORDER]).toEqual(Object.keys(TEMPLATES));
  });

  it('set all three values of a target, with no weekdays', () => {
    expect(targetOf('steady')).toEqual({ targetDays: 4, targetWeekdays: [], targetMin: 20 });
    expect(targetOf('paused')).toEqual({ targetDays: 0, targetWeekdays: [], targetMin: 0 });
  });
});

describe('matching a target to a template', () => {
  it('finds each of the four templates, and Paused as 0 days and 0 minutes', () => {
    expect(templateOf({ targetDays: 1, targetWeekdays: [], targetMin: 10 })).toBe('minimal');
    expect(templateOf({ targetDays: 3, targetWeekdays: [], targetMin: 15 })).toBe('light');
    expect(templateOf({ targetDays: 4, targetWeekdays: [], targetMin: 20 })).toBe('steady');
    expect(templateOf({ targetDays: 6, targetWeekdays: [], targetMin: 30 })).toBe('serious');
    expect(templateOf(paused)).toBe('paused');
  });

  it('round-trips with targetOf', () => {
    for (const t of TEMPLATE_ORDER) expect(templateOf(targetOf(t))).toBe(t);
  });

  it('is Custom (null) when days or minutes differ from every template', () => {
    expect(templateOf({ targetDays: 4, targetWeekdays: [], targetMin: 25 })).toBeNull();
    expect(templateOf({ targetDays: 5, targetWeekdays: [], targetMin: 20 })).toBeNull();
    expect(templateOf({ targetDays: 0, targetWeekdays: [], targetMin: 5 })).toBeNull();
  });

  it('is Custom when weekdays are chosen, even if days and minutes match a template', () => {
    expect(templateOf({ targetDays: 1, targetWeekdays: [2], targetMin: 10 })).toBeNull();
    expect(templateOf({ targetDays: 4, targetWeekdays: [0, 1, 2, 3], targetMin: 20 })).toBeNull();
  });
});

describe('showing targets', () => {
  const custom = (targetDays: number, targetMin: number, targetWeekdays: number[] = []): Target => ({ targetDays, targetWeekdays, targetMin });

  it('describes a template with its name and target', () => {
    expect(describeTarget(targetOf('steady'))).toBe('Steady · 4 days a week · 20 min');
    expect(describeTarget(targetOf('minimal'))).toBe('Minimal · 1 day a week · 10 min');
    expect(describeTarget(targetOf('paused'))).toBe('Paused');
  });

  it('describes a Custom target without a name', () => {
    expect(describeTarget(custom(3, 25))).toBe('3 days a week · 25 min');
    expect(describeTarget(custom(1, 45))).toBe('1 day a week · 45 min');
  });

  it('describes chosen weekdays by name, in week order', () => {
    expect(describeTarget(custom(3, 30, [4, 0, 2]))).toBe('Mon Wed Fri · 30 min');
  });

  it('gives a short hint for a template button', () => {
    expect(targetHint('serious')).toBe('6 days · 30 min');
    expect(targetHint('minimal')).toBe('1 day · 10 min');
    expect(targetHint('paused')).toBe('No target');
  });

  it('calls a practice with no days Paused', () => {
    expect(isPaused(paused)).toBe(true);
    expect(isPaused(targetOf('minimal'))).toBe(false);
  });
});

describe('listing practices', () => {
  it('puts live practices in order and Paused ones last, leaving out deleted ones', () => {
    const [a, b, c] = three();
    const out = listPractices([
      { ...a, ...paused },
      { ...b, deletedAt: 5 },
      c,
      { ...makePractice([a, b, c], { ...fields, name: 'D' }, 1), ...targetOf('light') },
    ]);
    expect(out.map((p) => p.name)).toEqual(['C', 'D', 'A']);
  });

  it('keeps the order among Paused ones', () => {
    const [a, b] = three();
    expect(
      listPractices([
        { ...b, ...paused },
        { ...a, ...paused },
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
    const out = updatePractice(ps, ps[1].id, { ...targetOf('light'), name: 'Bee' }, 9);
    expect(out[1]).toMatchObject({ targetDays: 3, targetMin: 15, name: 'Bee', updatedAt: 9, createdAt: 1 });
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

const withTemplates = (templates: TemplateKey[]) =>
  templates.reduce<Practice[]>((ps, t, i) => [...ps, makePractice(ps, { ...fields, ...targetOf(t), name: `P${i}` }, 1)], []);

describe('planned time', () => {
  it('adds days times minutes of every live practice', () => {
    expect(plannedMinutes(withTemplates(['steady', 'light', 'minimal']))).toBe(80 + 45 + 10);
    expect(plannedMinutes([])).toBe(0);
  });

  it('costs a Custom target by its own days and minutes', () => {
    expect(weekCost({ targetDays: 5, targetWeekdays: [], targetMin: 25 })).toBe(125);
    expect(weekCost({ targetDays: 3, targetWeekdays: [0, 2, 4], targetMin: 60 })).toBe(180);
  });

  it('counts a paused practice as nothing, and leaves out deleted ones', () => {
    const ps = withTemplates(['serious', 'paused', 'steady']);
    expect(plannedMinutes(ps)).toBe(260);
    expect(plannedMinutes(removePractice(ps, ps[0].id, 5))).toBe(80);
  });
});

describe('fitting a target under the cap', () => {
  const ps = withTemplates(['steady', 'light']); // 125 min

  it('fits anything with no cap', () => {
    expect(targetFits(ps, undefined, targetOf('serious'), null)).toBe(true);
    expect(targetOverBy(ps, undefined, targetOf('serious'), null)).toBe(0);
  });

  it('refuses a new practice with a target that would pass the cap, and says by how much', () => {
    expect(targetFits(ps, undefined, targetOf('minimal'), 160)).toBe(true); // 135
    expect(targetFits(ps, undefined, targetOf('light'), 160)).toBe(false); // 170
    expect(targetOverBy(ps, undefined, targetOf('light'), 160)).toBe(10);
    expect(targetOverBy(ps, undefined, targetOf('serious'), 160)).toBe(145);
  });

  it('fits a total exactly at the cap', () => {
    expect(targetFits(ps, undefined, targetOf('light'), 170)).toBe(true);
    expect(targetFits(ps, undefined, targetOf('light'), 169)).toBe(false);
  });

  it('counts a practice being edited at its new target, not its old one', () => {
    // Raising Light to Steady: 80 + 80 = 160.
    expect(targetFits(ps, ps[1].id, targetOf('steady'), 160)).toBe(true);
    expect(targetFits(ps, ps[1].id, targetOf('steady'), 159)).toBe(false);
    expect(targetOverBy(ps, ps[1].id, targetOf('serious'), 200)).toBe(60);
  });

  it('always allows a practice to keep or lower its cost, even over the cap', () => {
    // 125 planned against a 100 cap: over, but working it down is allowed.
    expect(targetFits(ps, ps[0].id, targetOf('steady'), 100)).toBe(true);
    expect(targetFits(ps, ps[0].id, targetOf('light'), 100)).toBe(true);
    expect(targetFits(ps, ps[1].id, targetOf('steady'), 100)).toBe(false);
    expect(targetFits(ps, undefined, targetOf('paused'), 100)).toBe(true);
    expect(targetFits(ps, undefined, targetOf('minimal'), 100)).toBe(false);
  });

  it('lets a Custom target over the cap be saved unchanged or lower, but not higher', () => {
    const big = makePractice([], { ...fields, targetDays: 3, targetWeekdays: [0, 2, 4], targetMin: 60 }, 1); // 180
    const only = [big];
    expect(targetFits(only, big.id, { targetDays: 3, targetWeekdays: [0, 2, 4], targetMin: 60 }, 100)).toBe(true);
    expect(targetFits(only, big.id, { targetDays: 3, targetWeekdays: [], targetMin: 50 }, 100)).toBe(true); // 150, lower
    expect(targetFits(only, big.id, { targetDays: 3, targetWeekdays: [], targetMin: 61 }, 100)).toBe(false); // 183, higher
    expect(targetOverBy(only, big.id, { targetDays: 3, targetWeekdays: [], targetMin: 61 }, 100)).toBe(83);
  });

  it('ignores a deleted practice', () => {
    expect(targetFits(removePractice(ps, ps[0].id, 5), undefined, targetOf('steady'), 125)).toBe(true);
  });
});

// ── Days and time ─────────────────────────────────────────────────────────────

const MIN = 60_000;
const DAY = 24 * 60;
const T0 = new Date(2026, 9, 12, 10, 0).getTime(); // Monday 12 Oct, 10:00
const at = (min: number) => T0 + min * MIN;
/** A moment `day` days after Monday 10:00 plus `min` minutes: day 4 is Friday. */
const when = (day: number, min = 0) => at(day * DAY + min);
/** Minutes from T0 to `h`:00 on `day` (Monday is 0). */
const clock = (day: number, h: number, m = 0) => day * DAY + (h - 10) * 60 + m;
const MONDAY = '2026-10-12';
const weekOf = (dayEndHour = 0) => weekWindowOf(dayKeyOf(T0, dayEndHour), dayEndHour);

let seq = 0;
function entry(state: TimeEntry['state'], from: number, to: number | null, practiceId?: string, extra: Partial<TimeEntry> = {}): TimeEntry {
  return { id: `e${seq++}`, state, startedAt: at(from), endedAt: to === null ? null : at(to), practiceId, updatedAt: 1, ...extra };
}
const timedEntry = (from: number, planned: number, to: number | null, practiceId?: string) =>
  entry('timed', from, to, practiceId, { plannedMs: planned * MIN });

describe('counting days', () => {
  const g = { id: 'g', targetMin: 20 };
  const days = (entries: TimeEntry[], now = at(10 * DAY), dayEndHour = 0, practice = g) => countedDays(entries, practice, weekOf(dayEndHour), now, dayEndHour);

  it('measures the minutes on each day of the week', () => {
    const entries = [
      entry('should', 0, 25, 'g'),
      entry('want', 25, 30, 'g'),
      timedEntry(30, 20, 50, 'g'),
      entry('should', DAY, DAY + 99, 'g'),
      entry('should', 0, 70, 'd'),
    ];
    const totals = weekTotals(entries, 'g', weekOf(), at(5 * DAY), 0);
    expect(totals.map((d) => d.key)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(totals.map((d) => d.ms / MIN)).toEqual([45, 99, 0, 0, 0, 0, 0]);
  });

  it('counts a day that reaches the minutes, to the minute', () => {
    expect(days([entry('should', 0, 20, 'g')])).toEqual([MONDAY]);
    expect(days([entry('should', 0, 19, 'g')])).toEqual([]);
  });

  it('adds Flow and Timed on the same day', () => {
    const entries = [entry('should', 0, 12, 'g'), entry('want', 12, 30, 'g'), timedEntry(40, 20, 48, 'g')];
    expect(days(entries)).toEqual([MONDAY]);
  });

  it('adds up several short stints, apart from each other and with other practices between', () => {
    const entries = [entry('should', 0, 8, 'g'), entry('should', 8, 30, 'd'), entry('should', 30, 36, 'g'), entry('should', 36, 42, 'g')];
    expect(days(entries)).toEqual([MONDAY]);
  });

  it('does not count Rest, other practices, deleted entries or zero-length ones', () => {
    const entries = [
      entry('should', 0, 12, 'g'),
      entry('want', 12, 60, 'g'),
      entry('should', 70, 200, 'd'),
      entry('should', 200, 230, 'g', { deletedAt: 5 }),
      entry('should', 90, 90, 'g'),
    ];
    expect(days(entries)).toEqual([]);
  });

  it('keeps each day apart: short stints on two days make none', () => {
    expect(days([entry('should', 0, 12, 'g'), entry('should', DAY, DAY + 12, 'g')])).toEqual([]);
  });

  it('returns the counted days in week order', () => {
    const entries = [entry('should', 3 * DAY, 3 * DAY + 20, 'g'), entry('should', 0, 30, 'g'), entry('should', DAY, DAY + 25, 'g')];
    expect(days(entries)).toEqual(['2026-10-12', '2026-10-13', '2026-10-15']);
  });

  it('ignores days outside the week', () => {
    expect(days([entry('should', -DAY, -DAY + 60, 'g'), entry('should', 7 * DAY, 7 * DAY + 60, 'g')])).toEqual([]);
  });

  it('counts a running entry up to now, so it crosses the target as time passes', () => {
    const running = [entry('should', 0, null, 'g')];
    expect(days(running, at(15))).toEqual([]);
    expect(days(running, at(25))).toEqual([MONDAY]);
  });

  it('never counts a Timed entry past its planned length', () => {
    expect(days([timedEntry(0, 15, null, 'g')], at(90))).toEqual([]);
    expect(days([timedEntry(0, 20, null, 'g')], at(90))).toEqual([MONDAY]);
  });

  it('splits a stint across the day end between the two days', () => {
    // 23:50 to 00:15 is 10 minutes of Monday and 15 of Tuesday: neither reaches 20.
    const across = [entry('should', clock(0, 23, 50), clock(1, 0, 15), 'g')];
    expect(days(across)).toEqual([]);
    // 23:40 to 00:10 puts 20 on Monday.
    expect(days([entry('should', clock(0, 23, 40), clock(1, 0, 10), 'g')])).toEqual([MONDAY]);
  });

  it('re-windows past days when the day end hour changes', () => {
    // 01:00 to 01:30 on Tuesday is Tuesday at midnight, but still Monday night at a 3 AM day end.
    const late = [entry('should', clock(1, 1), clock(1, 1, 30), 'g')];
    expect(days(late, at(10 * DAY), 0)).toEqual(['2026-10-13']);
    expect(days(late, at(10 * DAY), 3)).toEqual([MONDAY]);
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
  /** A Timed session of `min` minutes, `day` days after Monday 12 Oct at 10:00. */
  const sit = (practiceId: string, day: number, min: number) => timedEntry(day * DAY, min, day * DAY + min, practiceId);
  const named = (template: TemplateKey, name: string, order = 1): Practice => ({
    ...makePractice([], { ...fields, ...targetOf(template), name }, 1),
    id: name,
    order,
  });
  const custom = (name: string, targetDays: number, targetMin: number, targetWeekdays: number[] = [], order = 1): Practice => ({
    ...makePractice([], { name, targetDays, targetWeekdays, targetMin }, 1),
    id: name,
    order,
  });
  const names = (out: ReturnType<typeof needsAttention>) => out.map((a) => a.practice.name);

  const guitar = named('steady', 'Guitar'); // 4 days a week, 20 min
  const drawing = named('light', 'Drawing', 2); // 3 days, 15 min
  const spanish = named('minimal', 'Spanish', 3); // 1 day, 10 min

  it('lists what is behind, with the days done, left and left to do them in', () => {
    const out = needsAttention([guitar, drawing], [sit('Guitar', 0, 30)], when(0, 60), 0);
    expect(out.map((a) => [a.practice.name, a.done, a.left, a.daysLeft])).toEqual([
      ['Drawing', 0, 3, 7],
      ['Guitar', 1, 3, 7],
    ]);
  });

  it('counts a day by its accumulated minutes, across Flow and Timed', () => {
    const entries = [entry('should', 0, 6, 'Spanish'), entry('want', 6, 30, 'Spanish'), timedEntry(40, 10, 44, 'Spanish')];
    expect(names(needsAttention([spanish], entries, at(60), 0))).toEqual([]);
    const short = [entry('should', 0, 4, 'Spanish'), entry('want', 4, 30, 'Spanish'), timedEntry(40, 10, 44, 'Spanish')];
    expect(names(needsAttention([spanish], short, at(60), 0))).toEqual(['Spanish']);
  });

  it('does not count a day short of the minutes, or minutes spread over two days', () => {
    const entries = [sit('Spanish', 1, 9), sit('Guitar', 1, 19), sit('Drawing', 0, 8), sit('Drawing', 1, 8)];
    const out = needsAttention([guitar, drawing, spanish], entries, when(3), 0);
    expect(out.map((a) => [a.practice.name, a.done])).toEqual([
      ['Guitar', 0], // Thursday: 4 left in 4 days
      ['Drawing', 0], // 3 left in 4
      ['Spanish', 0], // 1 left in 4
    ]);
  });

  it('ranks by days left per day left, on a Monday, a Friday and a Sunday', () => {
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
    const gone = { ...named('steady', 'Gone', 5), deletedAt: 9 };
    expect(names(needsAttention([guitar, spanish, named('paused', 'Paused', 4), gone], entries, when(3), 0))).toEqual(['Guitar']);
  });

  it("does not count last week's days", () => {
    expect(names(needsAttention([spanish], [sit('Spanish', -2, 30)], when(0, 60), 0))).toEqual(['Spanish']);
  });

  it('counts a Custom target by its own days and minutes', () => {
    const five = custom('Five', 5, 45);
    const out = needsAttention([five], [sit('Five', 0, 44), sit('Five', 1, 45)], when(2), 0);
    expect(out.map((a) => [a.done, a.left])).toEqual([[1, 4]]);
  });

  it('counts a running entry as it crosses the daily minutes', () => {
    const running = [entry('should', 0, null, 'Spanish')];
    expect(names(needsAttention([spanish], running, at(9), 0))).toEqual(['Spanish']);
    expect(names(needsAttention([spanish], running, at(11), 0))).toEqual([]);
  });

  describe('with chosen weekdays', () => {
    // Mon Wed Fri, 20 min each.
    const mwf = custom('MWF', 3, 20, [0, 2, 4]);

    it('puts a practice due today ahead of one that is more behind', () => {
      const due = custom('Due', 2, 20, [4, 5], 2); // Fri and Sat, so due on Friday: 2 left in 2 days
      const behind = named('steady', 'Behind'); // 4 left in 3 days
      expect(names(needsAttention([behind, due], [], when(4, 60), 0))).toEqual(['Due', 'Behind']);
    });

    it('drops it back once today is done', () => {
      const due = custom('Due', 2, 20, [4, 5], 2);
      const behind = named('steady', 'Behind');
      expect(names(needsAttention([behind, due], [sit('Due', 4, 20)], when(4, 120), 0))).toEqual(['Behind', 'Due']);
      // Short of the minutes is still due.
      expect(names(needsAttention([behind, due], [sit('Due', 4, 19)], when(4, 120), 0))).toEqual(['Due', 'Behind']);
    });

    it('has no due tier on a day it was not chosen for, or without weekdays', () => {
      const later = custom('Later', 2, 20, [3, 4], 2); // Thu and Fri, not Tuesday
      const wide = custom('Wide', 7, 10); // 7 left in 6 days on a Tuesday
      expect(names(needsAttention([later, wide], [], when(1, 60), 0))).toEqual(['Wide', 'Later']);
      // The same two with no weekdays rank in the order of left per day left.
      expect(names(needsAttention([{ ...later, targetWeekdays: [] }, wide], [], when(1, 60), 0))).toEqual(['Wide', 'Later']);
    });

    it('is no longer listed once the week is met', () => {
      const met = [sit('MWF', 0, 20), sit('MWF', 1, 20), sit('MWF', 2, 20)];
      expect(names(needsAttention([mwf], met, when(4, 60), 0))).toEqual([]);
    });

    it('counts a day made up on another weekday toward the week', () => {
      // Tuesday is not chosen, but it still counts.
      const out = needsAttention([mwf], [sit('MWF', 1, 20)], when(2, 60), 0);
      expect(out.map((a) => [a.done, a.left])).toEqual([[1, 2]]);
    });

    it('counts the days left as the days still needed, or the chosen weekdays ahead if more', () => {
      const daysLeftOn = (day: number) => needsAttention([mwf], [], when(day, 60), 0)[0].daysLeft;
      // 3 needed, so no fewer than 3 while the week has them.
      expect(daysLeftOn(0)).toBe(3);
      expect(daysLeftOn(1)).toBe(3);
      expect(daysLeftOn(2)).toBe(3);
      expect(daysLeftOn(3)).toBe(3);
      expect(daysLeftOn(4)).toBe(3);
      // ...and no more than the week has left.
      expect(daysLeftOn(5)).toBe(2);
      expect(daysLeftOn(6)).toBe(1);
    });

    it('shows as many days left as days needed for Tuesday and Thursday, on a Thursday with nothing done', () => {
      const tueThu = custom('TueThu', 2, 20, [1, 3]);
      const out = needsAttention([tueThu], [], when(3, 60), 0);
      expect(out.map((a) => [a.left, a.daysLeft])).toEqual([[2, 2]]);
    });

    it('leaves today out of the chosen days ahead once it is done', () => {
      // Wednesday is met and it is Wednesday: 2 still needed, only Friday is chosen ahead, so 2 days (Thu, Fri).
      const out = needsAttention([mwf], [sit('MWF', 2, 20)], when(2, 60), 0);
      expect(out.map((a) => [a.done, a.left, a.daysLeft])).toEqual([[1, 2, 2]]);
    });

    it('shows the chosen weekdays ahead when they outnumber the days needed', () => {
      // Monday and a made-up Tuesday are done; Wednesday and Friday are still ahead for the one day left.
      const out = needsAttention([mwf], [sit('MWF', 0, 20), sit('MWF', 1, 20)], when(1, 60), 0);
      expect(out.map((a) => [a.done, a.left, a.daysLeft])).toEqual([[2, 1, 2]]);
    });
  });

  describe('breaking a tie', () => {
    const light = (name: string, order: number) => named('light', name, order);

    it('goes to the oldest last practice, one never practised first', () => {
      const [a, b, c] = [light('A', 1), light('B', 2), light('C', 3)];
      // Short sessions do not count as days, but they are still the last practice.
      const entries = [sit('A', 2, 5), sit('B', 1, 5)];
      expect(names(needsAttention([a, b, c], entries, when(3), 0))).toEqual(['C', 'B', 'A']);
    });

    it('ignores Rest as practice', () => {
      const [a, b] = [light('A', 1), light('B', 2)];
      // A was practised Monday and only rested on Thursday; B was practised Tuesday.
      const entries = [sit('A', 0, 5), entry('want', 3 * DAY, 3 * DAY + 30, 'A'), sit('B', 1, 5)];
      expect(names(needsAttention([a, b], entries, when(4), 0))).toEqual(['A', 'B']);
    });

    it('ignores zero-length and deleted entries', () => {
      const [a, b] = [light('A', 1), light('B', 2)];
      // B was practised Monday; its Thursday entry has no length and its Wednesday one is deleted.
      const entries = [sit('A', 1, 5), sit('B', 0, 5), sit('B', 3, 0), { ...sit('B', 2, 5), deletedAt: 5 }];
      expect(names(needsAttention([a, b], entries, when(4), 0))).toEqual(['B', 'A']);
    });

    it('falls back to the list order on a full tie', () => {
      expect(names(needsAttention([light('A', 2), light('B', 1)], [], when(1), 0))).toEqual(['B', 'A']);
    });
  });

  it('follows the day end hour: 1 AM Monday is still last week', () => {
    const monday1am = new Date(2026, 9, 19, 1, 0).getTime();
    expect(needsAttention([guitar], [], monday1am, 3)[0].daysLeft).toBe(1);
    expect(needsAttention([guitar], [], monday1am, 0)[0].daysLeft).toBe(7);
  });
});
