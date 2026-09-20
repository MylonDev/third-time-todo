# Phase 1 — Projects and the time-entry ledger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace goals with projects, replace the session/`SessionLog` model with
an editable wall-clock ledger of `TimeEntry` records, derive the break bank from
that ledger, and let the user say when their day ends.

**Architecture:** One ledger, everything else derived. A `TimeEntry` has
`startedAt`/`endedAt` and no stored duration; the break bank is a pure function
over today's entries plus the live open segment; a project's period progress is a
rollup over entries. Date keys stop meaning "calendar midnight" and start meaning
"since my day began", via a single `dayKeyOf(t, dayEndHour)`.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind 4, zustand + `persist`,
Playwright for e2e, **vitest (added by Task 1)** for pure-function unit tests.

**Spec:** `docs/specs/2026-09-20-projects-and-schedule.md` — read it before Task 1.
This plan implements **Phase 1 only** (spec §1.0–§1.8). Phases 2–4 get their own
plans.

## Global Constraints

- **Persisted stores are versioned.** Any shape change bumps `version` and extends
  `migrate`. Target versions in this phase: `tt-settings` 8→9, `tt-session` 3→4,
  `tt-goals` 3→4, `tt-tasks` 6→7.
- **Migrations never delete persisted fields.** Dropped fields stay in the blob,
  unread. `tt-habits` is orphaned but its key is left untouched.
- **No stored durations on a `TimeEntry`.** Duration is always `endedAt - startedAt`.
- **No stored `bankMs`.** The bank is always `bankOf(...)`.
- **No silent `dayEndHour` default at call sites.** Every caller reads it from the
  settings store. A local `?? 0` fallback is how half the app would keep cutting
  at midnight.
- `dayEndHour` is one of `0 | 1 | 2 | 3 | 4` (local hours after midnight).
- Each task ends green on `npm run lint`, `npm run build`, and whichever of
  `npm run test:unit` / `npm test` it touched.
- Commit at the end of every task. Commit messages are lowercase
  `type: summary` in the repo's existing voice. **Do not add any Claude or
  AI co-author trailer, and do not mention Claude in commit messages.**

---

### Task 1: A unit-test harness and the day boundary function

The correctness-critical parts of this phase — migration arithmetic, the bank,
the day key — are pure functions. Driving them through Playwright is slow and
indirect, so add vitest alongside the existing e2e suite.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/utils/thirdTime.test.ts`
- Modify: `src/utils/thirdTime.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `dayKeyOf(t: number, dayEndHour: number): string`
  - `todayKey(dayEndHour: number): string`
  - `tomorrowKey(dayEndHour: number): string`
  - `dayStartOf(key: string, dayEndHour: number): number` — the wall-clock ms at
    which the day `key` begins.
  - `dayEndOf(key: string, dayEndHour: number): number` — the ms at which it ends
    (= `dayStartOf` of the next key).
  - npm scripts `test:unit` and `test:unit:watch`.

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Add the config and scripts**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

/**
 * Unit tests cover the pure logic — date keys, the bank, store migrations.
 * Anything that needs a browser stays in `e2e/` under Playwright.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

In `package.json` `scripts`, add:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

`npm test` stays Playwright-only so CI's existing job is unchanged.

- [ ] **Step 3: Write the failing test**

Create `src/utils/thirdTime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dayKeyOf, dayStartOf, dayEndOf } from './thirdTime';

/** Local-time timestamp helper, so these tests don't depend on the TZ. */
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

describe('dayKeyOf', () => {
  it('cuts at midnight when dayEndHour is 0', () => {
    expect(dayKeyOf(at(2026, 9, 20, 23, 59), 0)).toBe('2026-09-20');
    expect(dayKeyOf(at(2026, 9, 21, 0, 1), 0)).toBe('2026-09-21');
  });

  it('keeps the small hours on the previous day when dayEndHour is 2', () => {
    expect(dayKeyOf(at(2026, 9, 21, 1, 30), 2)).toBe('2026-09-20');
    expect(dayKeyOf(at(2026, 9, 21, 1, 59), 2)).toBe('2026-09-20');
    expect(dayKeyOf(at(2026, 9, 21, 2, 0), 2)).toBe('2026-09-21');
  });

  it('is unaffected during the working day', () => {
    expect(dayKeyOf(at(2026, 9, 21, 14, 0), 2)).toBe('2026-09-21');
  });
});

describe('dayStartOf / dayEndOf', () => {
  it('bracket the day named by the key', () => {
    expect(dayStartOf('2026-09-20', 2)).toBe(at(2026, 9, 20, 2));
    expect(dayEndOf('2026-09-20', 2)).toBe(at(2026, 9, 21, 2));
  });

  it('round-trip: any instant inside the bracket maps back to the key', () => {
    const key = '2026-09-20';
    const mid = (dayStartOf(key, 3) + dayEndOf(key, 3)) / 2;
    expect(dayKeyOf(mid, 3)).toBe(key);
    expect(dayKeyOf(dayStartOf(key, 3), 3)).toBe(key);
    expect(dayKeyOf(dayEndOf(key, 3) - 1, 3)).toBe(key);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npm run test:unit`
Expected: FAIL — `dayKeyOf is not a function` (and the same for the other two).

- [ ] **Step 5: Implement**

In `src/utils/thirdTime.ts`, replace the existing `todayKey` / `tomorrowKey` with:

```ts
import { dateKey } from './goalPeriod';

const HOUR_MS = 3_600_000;

/**
 * The day a moment belongs to. A day ends at `dayEndHour` local time, not
 * necessarily midnight — someone who works until 1 AM is still having last
 * night, and their bank, timeline and task list should agree.
 */
export function dayKeyOf(t: number, dayEndHour: number): string {
  return dateKey(new Date(t - dayEndHour * HOUR_MS));
}

export function todayKey(dayEndHour: number): string {
  return dayKeyOf(Date.now(), dayEndHour);
}

export function tomorrowKey(dayEndHour: number): string {
  return dayKeyOf(Date.now() + 86_400_000, dayEndHour);
}

/** The instant the day named by `key` begins. */
export function dayStartOf(key: string, dayEndHour: number): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, dayEndHour, 0, 0, 0).getTime();
}

/** The instant it ends — the same as the next day's start. */
export function dayEndOf(key: string, dayEndHour: number): number {
  return dayStartOf(key, dayEndHour) + 86_400_000;
}
```

`dateKey` lives in `goalPeriod.ts` and already does the local YYYY-MM-DD
formatting; importing it removes the duplicate that `thirdTime.ts` carried.
Watch for an import cycle — `goalPeriod.ts` imports `todayKey` from
`thirdTime.ts` today. Task 2 breaks that cycle; if `tsc` complains here, move
`dateKey` and `weekdayIndex` into `thirdTime.ts` and re-export them from
`goalPeriod.ts` instead.

`npm run build` will now fail at every `todayKey()` call site. That is expected
and Task 2 fixes it — **do not** add a default parameter to silence it.

- [ ] **Step 6: Run the unit tests**

Run: `npm run test:unit`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/utils/thirdTime.ts src/utils/thirdTime.test.ts
git commit -m "test: a vitest harness, and a day that need not end at midnight"
```

---

### Task 2: `dayEndHour` in settings, and every caller routed through it

**Files:**
- Modify: `src/store/settings.ts` (v8 → v9)
- Modify: `src/utils/goalPeriod.ts`, `src/store/tasks.ts`, `src/store/session.ts`,
  `src/store/goals.ts`, `src/App.tsx`, `src/components/TaskList.tsx`,
  `src/components/PaceChart.tsx`, `src/components/Activity.tsx`,
  `src/components/EndSessionModal.tsx`
- Modify: `src/components/OptionsPanel.tsx`
- Create: `e2e/day-boundary.spec.ts`

**Interfaces:**
- Consumes: `dayKeyOf`, `todayKey(dayEndHour)`, `dayStartOf`, `dayEndOf` (Task 1).
- Produces:
  - `useSettings().dayEndHour: number`, `setDayEndHour(h: number): void`
  - `getPeriodKey(period, periodDays, anchor, dayEndHour)` and
    `effortPeriodKey(effort, anchor, dayEndHour)` — both gain a trailing
    `dayEndHour` parameter.
  - `getWeekKey(date: Date, dayEndHour: number)` — the week boundary moves with
    the day boundary.

- [ ] **Step 1: Write the failing e2e test**

Create `e2e/day-boundary.spec.ts`:

```ts
import { test, expect, switchTab } from './helpers';

test.describe('the end of the day', () => {
  test('defaults to midnight and offers up to 4 AM', async ({ app }) => {
    await app.getByRole('button', { name: 'Options' }).click();
    const select = app.getByLabel('My day ends at');
    await expect(select).toHaveValue('0');
    await expect(select.getByRole('option')).toHaveCount(5);
    await expect(select.getByRole('option', { name: '4 AM' })).toBeAttached();
  });

  test('the choice survives a reload', async ({ app }) => {
    await app.getByRole('button', { name: 'Options' }).click();
    await app.getByLabel('My day ends at').selectOption('2');
    await app.reload();
    await app.getByRole('button', { name: 'Options' }).click();
    await expect(app.getByLabel('My day ends at')).toHaveValue('2');
  });

  test('work in the small hours files under the previous day', async ({ app }) => {
    // 01:30, with the day ending at 2 AM, is still yesterday.
    await app.getByRole('button', { name: 'Options' }).click();
    await app.getByLabel('My day ends at').selectOption('2');
    await app.getByRole('button', { name: 'Close' }).click();

    const key = await app.evaluate(() => {
      const t = new Date();
      t.setHours(1, 30, 0, 0);
      // @ts-expect-error — test hook, see Step 4
      return window.__ttDayKeyOf(t.getTime(), 2);
    });
    const expected = await app.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
              String(d.getDate()).padStart(2, '0')].join('-');
    });
    expect(key).toBe(expected);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test e2e/day-boundary.spec.ts`
Expected: FAIL — no "My day ends at" control.

- [ ] **Step 3: Add the setting**

In `src/store/settings.ts`: add `dayEndHour: number` (default `0`) to the state
and the interface, add `setDayEndHour: (h: number) => void` clamped to 0–4, bump
`version` to `9`, and extend `migrate`:

```ts
if (version < 9) {
  return { ...state, dayEndHour: 0 };
}
```

- [ ] **Step 4: Expose the test hook**

In `src/main.tsx`, after the imports:

```ts
import { dayKeyOf } from './utils/thirdTime';

// A hook for the e2e suite, which cannot otherwise reach a pure function.
// Harmless in production and smaller than the alternatives.
(window as unknown as Record<string, unknown>).__ttDayKeyOf = dayKeyOf;
```

- [ ] **Step 5: Add the Options control**

In `src/components/OptionsPanel.tsx`, in the same section as the other
preferences, add a `<select>` labelled **"My day ends at"** with options
`0 → "Midnight"`, `1 → "1 AM"`, `2 → "2 AM"`, `3 → "3 AM"`, `4 → "4 AM"`, bound
to `dayEndHour` / `setDayEndHour`. Follow the markup and label pattern of the
existing theme control in the same file. Underneath, in the muted caption style
used elsewhere in the panel:

> Changing this does not rewrite past days.

- [ ] **Step 6: Route every caller**

Thread `dayEndHour` through — there are 11 call sites across 9 files (`grep -rn
"todayKey\|tomorrowKey" src`). Rules:

- **Components** read it from `useSettings()`.
- **Store actions** read it with `useSettings.getState().dayEndHour` at the top
  of the action. Do not store a copy.
- `getPeriodKey`, `effortPeriodKey`, `pastPeriodKeys` and `getWeekKey` in
  `goalPeriod.ts` take `dayEndHour` as a trailing parameter and pass it to
  `todayKey` / `dayKeyOf`. `getWeekKey(date, dayEndHour)` computes its Monday
  from `dayKeyOf(date.getTime(), dayEndHour)`, not from the raw date.
- `lastNDays` and `dateKey` stay pure calendar helpers and do **not** take it.
- No call site may pass a literal `0` or use `?? 0`.

- [ ] **Step 7: The turnover timer fires at the boundary**

In `src/App.tsx`, the midnight timer currently schedules on the next 00:00.
Change it to schedule on the next `dayEndOf(todayKey(dayEndHour), dayEndHour)`,
and to re-schedule when `dayEndHour` changes.

- [ ] **Step 8: Run everything**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green. The three new day-boundary tests pass; the pre-existing
suite is unchanged.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: the day ends when you say it does"
```

---

### Task 3: `TimeEntry` and the derived bank

Pure logic only. Nothing wires it up yet — Task 5 does.

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/ledger.ts`
- Create: `src/utils/ledger.test.ts`

**Interfaces:**
- Consumes: `Mode`, `earnBreak` (`utils/thirdTime.ts`), `dayKeyOf` (Task 1).
- Produces:
  - `interface TimeEntry` (spec §1.2)
  - `interface OpenSegment { kind: 'work' | 'break'; startedAt: number; mode: Mode; projectId?: string; taskId?: string }`
  - `durationOf(e: { startedAt: number; endedAt: number }): number`
  - `bankOf(entries: TimeEntry[], open?: OpenSegment | null, now?: number): number`
  - `workMsOf(entries: TimeEntry[]): number`, `breakMsOf(entries: TimeEntry[]): number`
  - `entriesOverlap(a, b): boolean`

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, in place of `SessionLog` (leave `SessionLog` exported
for now — Task 4's migration reads it — and delete it in Task 5):

```ts
export interface TimeEntry {
  id: string;
  kind: 'work' | 'break';
  /** Wall clock. Duration is always `endedAt - startedAt`; it is never stored. */
  startedAt: number;
  endedAt: number;
  projectId?: string; // work entries only
  taskId?: string;    // work entries only; implies the task's project
  /** The ratio in force when this ran, so changing difficulty is never retroactive. */
  mode: Mode;
}
```

And replace `DailyState` with:

```ts
export interface DailyState {
  date: string; // day key, per `dayKeyOf`
  entries: TimeEntry[];
}
```

`HistoryEntry.sessions` becomes `entries: TimeEntry[]`; its three `total*` fields
are unchanged.

- [ ] **Step 2: Write the failing test**

Create `src/utils/ledger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bankOf, durationOf, workMsOf, breakMsOf, entriesOverlap } from './ledger';
import type { TimeEntry } from '../types';

const MIN = 60_000;
let n = 0;
function work(fromMin: number, toMin: number, mode: TimeEntry['mode'] = 'third'): TimeEntry {
  return { id: `w${n++}`, kind: 'work', startedAt: fromMin * MIN, endedAt: toMin * MIN, mode };
}
function brk(fromMin: number, toMin: number): TimeEntry {
  return { id: `b${n++}`, kind: 'break', startedAt: fromMin * MIN, endedAt: toMin * MIN, mode: 'third' };
}

describe('bankOf', () => {
  it('is zero with no entries', () => {
    expect(bankOf([])).toBe(0);
  });

  it('earns at the entry\'s own ratio', () => {
    // 60 min at 1:3 earns 20 min.
    expect(bankOf([work(0, 60, 'third')])).toBe(20 * MIN);
    // 60 min at 1:2 earns 30.
    expect(bankOf([work(0, 60, 'half')])).toBe(30 * MIN);
  });

  it('mixes ratios without rewriting history', () => {
    // An hour earned at 1:3, then an hour at 1:2 — 20 + 30, not 2 × either.
    expect(bankOf([work(0, 60, 'third'), work(60, 120, 'half')])).toBe(50 * MIN);
  });

  it('spends break time', () => {
    expect(bankOf([work(0, 60, 'third'), brk(60, 70)])).toBe(10 * MIN);
  });

  it('goes into debt', () => {
    expect(bankOf([work(0, 30, 'third'), brk(30, 60)])).toBe(-20 * MIN);
  });

  it('counts an open work segment as it runs', () => {
    const open = { kind: 'work' as const, startedAt: 0, mode: 'third' as const };
    expect(bankOf([], open, 60 * MIN)).toBe(20 * MIN);
  });

  it('counts an open break as it runs', () => {
    const open = { kind: 'break' as const, startedAt: 60 * MIN, mode: 'third' as const };
    expect(bankOf([work(0, 60, 'third')], open, 70 * MIN)).toBe(10 * MIN);
  });

  it('ignores an open segment whose start is in the future', () => {
    const open = { kind: 'work' as const, startedAt: 90 * MIN, mode: 'third' as const };
    expect(bankOf([work(0, 60, 'third')], open, 60 * MIN)).toBe(20 * MIN);
  });
});

describe('sums', () => {
  it('separate work from break', () => {
    const day = [work(0, 60), brk(60, 70), work(70, 100)];
    expect(workMsOf(day)).toBe(90 * MIN);
    expect(breakMsOf(day)).toBe(10 * MIN);
    expect(durationOf(day[0])).toBe(60 * MIN);
  });
});

describe('entriesOverlap', () => {
  it('is false for touching entries', () => {
    expect(entriesOverlap(work(0, 60), brk(60, 70))).toBe(false);
  });
  it('is true when they cross', () => {
    expect(entriesOverlap(work(0, 60), work(59, 70))).toBe(true);
  });
  it('is true when one contains the other', () => {
    expect(entriesOverlap(work(0, 60), work(10, 20))).toBe(true);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm run test:unit src/utils/ledger.test.ts`
Expected: FAIL — cannot resolve `./ledger`.

- [ ] **Step 4: Implement**

Create `src/utils/ledger.ts`:

```ts
import type { Mode, TimeEntry } from '../types';
import { earnBreak } from './thirdTime';

/** A timer that is still running — not an entry until it stops. */
export interface OpenSegment {
  kind: 'work' | 'break';
  startedAt: number;
  mode: Mode;
  projectId?: string;
  taskId?: string;
}

export function durationOf(e: { startedAt: number; endedAt: number }): number {
  return Math.max(0, e.endedAt - e.startedAt);
}

export function workMsOf(entries: TimeEntry[]): number {
  return entries.filter((e) => e.kind === 'work').reduce((a, e) => a + durationOf(e), 0);
}

export function breakMsOf(entries: TimeEntry[]): number {
  return entries.filter((e) => e.kind === 'break').reduce((a, e) => a + durationOf(e), 0);
}

/**
 * The bank is not stored anywhere — it is this sum over the day's entries, plus
 * whatever the running timer has accrued so far. Deriving it is what makes
 * retroactive edits to the timeline trustworthy: trim a work block and the rest
 * it earned goes with it, with no delta arithmetic to get wrong.
 */
export function bankOf(entries: TimeEntry[], open?: OpenSegment | null, now = Date.now()): number {
  const all: { kind: 'work' | 'break'; startedAt: number; endedAt: number; mode: Mode }[] = [
    ...entries,
    ...(open && now > open.startedAt
      ? [{ kind: open.kind, startedAt: open.startedAt, endedAt: now, mode: open.mode }]
      : []),
  ];
  return all.reduce(
    (bank, e) =>
      e.kind === 'work' ? bank + earnBreak(durationOf(e), e.mode) : bank - durationOf(e),
    0
  );
}

/** Entries are a partition of the day: they may touch, never overlap. */
export function entriesOverlap(
  a: { startedAt: number; endedAt: number },
  b: { startedAt: number; endedAt: number }
): boolean {
  return a.startedAt < b.endedAt && b.startedAt < a.endedAt;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: PASS — 12 new tests plus Task 1's.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/ledger.ts src/utils/ledger.test.ts
git commit -m "feat: a time-entry ledger, and a bank derived from it"
```

---

### Task 4: The `tt-session` v3 → v4 migration

Get this wrong and every past timeline is silently wrong, so it is a pure
function with its own tests before it is wired to the store.

**Files:**
- Create: `src/store/sessionMigrate.ts`
- Create: `src/store/sessionMigrate.test.ts`

**Interfaces:**
- Consumes: `TimeEntry` (Task 3).
- Produces: `splitSessionLog(log: LegacySessionLog): TimeEntry[]` and
  `migrateSessionV3(state: unknown): { daily: DailyState; history: HistoryEntry[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/store/sessionMigrate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit src/store/sessionMigrate.test.ts`
Expected: FAIL — cannot resolve `./sessionMigrate`.

- [ ] **Step 3: Implement**

Create `src/store/sessionMigrate.ts`:

```ts
import type { DailyState, HistoryEntry, Mode, TimeEntry } from '../types';

/** A `SessionLog` as `tt-session` v3 and earlier persisted it. */
export interface LegacySessionLog {
  id: string;
  workMs: number;
  breakMs: number;
  mode: Mode;
  startedAt: number;
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * One old log fused a work stint and the break that followed it. The timeline
 * needs them as two wall-clock blocks:
 *
 *   work:  [startedAt,          startedAt + workMs]
 *   break: [startedAt + workMs, startedAt + workMs + breakMs]
 *
 * A zero-length half is dropped rather than stored as a point in time.
 */
export function splitSessionLog(log: LegacySessionLog): TimeEntry[] {
  const out: TimeEntry[] = [];
  const workEnd = log.startedAt + (log.workMs ?? 0);
  if ((log.workMs ?? 0) > 0) {
    out.push({ id: newId(), kind: 'work', startedAt: log.startedAt, endedAt: workEnd, mode: log.mode });
  }
  if ((log.breakMs ?? 0) > 0) {
    out.push({ id: newId(), kind: 'break', startedAt: workEnd, endedAt: workEnd + log.breakMs, mode: log.mode });
  }
  return out;
}

interface LegacyState {
  daily?: { date?: string; sessions?: LegacySessionLog[] };
  history?: (Omit<HistoryEntry, 'entries'> & { sessions?: LegacySessionLog[] })[];
}

export function migrateSessionV3(persisted: unknown): { daily: DailyState; history: HistoryEntry[] } {
  const s = (persisted ?? {}) as LegacyState;
  const daily: DailyState = {
    date: s.daily?.date ?? '',
    entries: (s.daily?.sessions ?? []).flatMap(splitSessionLog),
  };
  const history: HistoryEntry[] = (s.history ?? []).map((h) => ({
    date: h.date,
    totalWorkMs: h.totalWorkMs,
    totalBreakMs: h.totalBreakMs,
    unusedRestMs: h.unusedRestMs,
    entries: (h.sessions ?? []).flatMap(splitSessionLog),
  }));
  return { daily, history };
}
```

`daily.date` is left as whatever was stored — `''` for an empty store. The store
replaces a stale day on mount through `maybeArchivePreviousDay` (Task 5), which
is where that decision belongs.

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS — 10 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/store/sessionMigrate.ts src/store/sessionMigrate.test.ts
git commit -m "feat: split archived session logs into wall-clock entries"
```

---

### Task 5: The session store becomes a ledger, and sessions go away

The big one. After this task there is no End Session button anywhere.

**Files:**
- Modify: `src/store/session.ts`
- Modify: `src/components/BreakBank.tsx`, `src/components/SessionTimer.tsx`,
  `src/components/Activity.tsx`, `src/components/RestoreSessionModal.tsx`,
  `src/App.tsx`, `src/hooks/useFocusable.ts`, `src/types/index.ts`
- Delete: `src/components/EndSessionModal.tsx`
- Modify: `e2e/sessions.spec.ts`, `e2e/helpers.ts`, `e2e/modals.spec.ts`,
  `e2e/activity.spec.ts`

**Interfaces:**
- Consumes: `bankOf`, `workMsOf`, `breakMsOf`, `OpenSegment` (Task 3);
  `migrateSessionV3` (Task 4); `todayKey`, `dayEndOf` (Tasks 1–2).
- Produces the session store's new surface:
  - state: `daily: DailyState`, `history: HistoryEntry[]`, `timerState`,
    `timerStart`, `activeProjectId?: string`, `activeTaskId?: string`
  - `bank(): number` — `bankOf(daily.entries, openSegment(), Date.now())`
  - `startWork()`, `stopWork(mode)`, `startBreak(mode)`, `stopBreak()`
  - `setActive(projectId?: string, taskId?: string): void`
  - `addEntry(e: TimeEntry)`, `updateEntry(id, patch)`, `removeEntry(id)` —
    used by Task 9 and phase 2
  - `maybeArchivePreviousDay()`, `archiveDay()`, `clearTimer()`, `resetDay()`

- [ ] **Step 1: Rewrite the e2e expectations first**

In `e2e/helpers.ts`, replace `startSession` with:

```ts
export async function startWork(page: Page) {
  await page.getByRole('button', { name: 'Start →' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
}
```

Update `switchTab`'s doc comment to `(Projects / Tasks / Activity)` — the tabs
themselves change in Tasks 8 and 11.

In `e2e/sessions.spec.ts`, remove every test that presses **End Session** and add:

```ts
test('there is no session ceremony', async ({ app }) => {
  await startWork(app);
  await expect(app.getByRole('button', { name: 'End Session' })).toHaveCount(0);
});

test('the bank is rebuilt from the ledger after a reload', async ({ app }) => {
  await startWork(app);
  await app.waitForTimeout(2500);
  await app.getByRole('button', { name: 'Stop' }).click();
  const before = await app.getByTestId('bank-balance').textContent();
  await app.reload();
  await expect(app.getByTestId('bank-balance')).toHaveText(before!);
});

test('the bank advances while working', async ({ app }) => {
  await startWork(app);
  const first = await app.getByTestId('bank-balance').textContent();
  await app.waitForTimeout(4000);
  expect(await app.getByTestId('bank-balance').textContent()).not.toBe(first);
});
```

Add `data-testid="bank-balance"` to the balance element in `BreakBank.tsx` in
Step 3 — the e2e suite currently scrapes timers by class, which cannot tell the
bank from the stopwatch.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx playwright test e2e/sessions.spec.ts`
Expected: FAIL — `End Session` still present, no `bank-balance` testid.

- [ ] **Step 3: Rewrite the store**

In `src/store/session.ts`:

- Drop `bankMs`, `sessions`, `sessionStartedAt`, `unusedRestMs` from `daily`;
  drop `endSession`, `SessionReport`, `sessionClosedAt`, `focusedItem`,
  `focusSegmentStart`, `setFocus`, `setFocusSegmentStart`, `pruneFocus`,
  `commitFocusSegment`, `isFocusable`.
- `openSegment()` returns `{ kind, startedAt: timerStart, mode, projectId, taskId }`
  when a timer runs, else `null`. `mode` comes from
  `useSettings.getState().mode`.
- `stopWork(mode)` pushes one `TimeEntry` — `{ kind: 'work', startedAt: timerStart,
  endedAt: Date.now(), projectId: activeProjectId, taskId: activeTaskId, mode }` —
  and clears the timer. No bank arithmetic.
- `stopBreak()` pushes `{ kind: 'break', ... }`. It no longer amends the last
  entry.
- `archiveDay()` writes
  `{ date, totalWorkMs: workMsOf(entries), totalBreakMs: breakMsOf(entries),
     unusedRestMs: Math.max(0, bankOf(entries)), entries }`, keeping the
  120-entry cap.
- `maybeArchivePreviousDay()` keeps its "already today?" guard but loses the
  `timerState !== 'idle'` refusal — Task 6 replaces it.
- `addEntry` / `updateEntry` / `removeEntry` mutate `daily.entries` and keep them
  sorted by `startedAt`. They reject an entry that overlaps another
  (`entriesOverlap`) by returning without writing.
- `version: 4`, and `migrate` delegates to `migrateSessionV3` for `version < 4`,
  chaining after the existing v1/v2 branches.
- `partialize` persists `daily`, `history`, `timerState`, `timerStart`,
  `activeProjectId`, `activeTaskId`.

In `BreakBank.tsx` and `SessionTimer.tsx`: read the balance from
`bankOf(daily.entries, openSegment, now)` using the existing `useNow` tick rather
than `daily.bankMs`, and add `data-testid="bank-balance"`. In `Activity.tsx`,
`DayShape` and the day card read `entry.entries` instead of `entry.sessions`, and
`restEarned` sums `earnBreak(durationOf(e), e.mode)` over work entries. Delete
`EndSessionModal.tsx` and its imports, and the `End Session` button in `App.tsx`.
`RestoreSessionModal` keeps its job — restore or discard a timer that was running
at reload — with "start a new session" reworded to "Discard it".

- [ ] **Step 4: Run everything**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green. If an old spec still references End Session, delete that
test — the behaviour is gone, not broken.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: the day is a ledger of entries, and the bank is derived from it"
```

---

### Task 6: A timer that runs past the end of the day

**Files:**
- Modify: `src/store/session.ts`
- Create: `src/store/session.dayRoll.test.ts`
- Modify: `e2e/sessions.spec.ts`

**Interfaces:**
- Consumes: `dayEndOf`, `dayKeyOf` (Task 1), the store surface from Task 5.
- Produces: `splitAtBoundary(open: OpenSegment, boundary: number, now: number):
  { closed: TimeEntry; reopened: OpenSegment }` in `src/utils/ledger.ts`.

- [ ] **Step 1: Write the failing unit test**

Create `src/store/session.dayRoll.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splitAtBoundary } from '../utils/ledger';

const HOUR = 3_600_000;

describe('splitAtBoundary', () => {
  const open = { kind: 'work' as const, startedAt: 0, mode: 'third' as const, projectId: 'p1' };

  it('closes the entry at the boundary', () => {
    const { closed } = splitAtBoundary(open, 5 * HOUR, 7 * HOUR);
    expect(closed).toMatchObject({ kind: 'work', startedAt: 0, endedAt: 5 * HOUR, projectId: 'p1' });
  });

  it('reopens the same kind and project on the far side', () => {
    const { reopened } = splitAtBoundary(open, 5 * HOUR, 7 * HOUR);
    expect(reopened).toMatchObject({ kind: 'work', startedAt: 5 * HOUR, projectId: 'p1' });
  });

  it('loses no time across the split', () => {
    const { closed, reopened } = splitAtBoundary(open, 5 * HOUR, 7 * HOUR);
    const total = (closed.endedAt - closed.startedAt) + (7 * HOUR - reopened.startedAt);
    expect(total).toBe(7 * HOUR);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit src/store/session.dayRoll.test.ts`
Expected: FAIL — `splitAtBoundary is not exported`.

- [ ] **Step 3: Implement**

In `src/utils/ledger.ts`:

```ts
/**
 * A timer left running across the end of the day. With no End Session button,
 * this is the ordinary case for anyone who forgets to stop — so the day is not
 * allowed to stall on it. The entry is closed at the boundary and an identical
 * one opens on the far side; the timeline then shows an honest (if long) block
 * on each day, which the user can trim.
 */
export function splitAtBoundary(
  open: OpenSegment,
  boundary: number,
  _now: number
): { closed: TimeEntry; reopened: OpenSegment } {
  return {
    closed: {
      id: crypto.randomUUID(),
      kind: open.kind,
      startedAt: open.startedAt,
      endedAt: boundary,
      projectId: open.projectId,
      taskId: open.taskId,
      mode: open.mode,
    },
    reopened: { ...open, startedAt: boundary },
  };
}
```

In `session.ts`, `maybeArchivePreviousDay()` becomes: if `daily.date` is today,
return. Otherwise, if a timer is running and started before
`dayEndOf(daily.date, dayEndHour)`, call `splitAtBoundary`, push `closed` into
`daily.entries`, archive, start the fresh day, and set `timerStart` to
`reopened.startedAt`. Then archive as before and reset `daily` to
`{ date: todayKey(dayEndHour), entries: [] }`.

- [ ] **Step 4: Add the e2e check**

In `e2e/sessions.spec.ts`:

```ts
test('a timer left running across the boundary does not stall the day', async ({ app }) => {
  await startWork(app);
  // Rewind the stored day so the next mount sees a boundary crossing.
  await app.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('tt-session')!);
    raw.state.daily.date = '2020-01-01';
    raw.state.timerStart = new Date('2020-01-01T23:00:00').getTime();
    localStorage.setItem('tt-session', JSON.stringify(raw));
  });
  await app.reload();

  const state = await app.evaluate(() => JSON.parse(localStorage.getItem('tt-session')!).state);
  expect(state.daily.date).not.toBe('2020-01-01');
  expect(state.history.some((h: { date: string }) => h.date === '2020-01-01')).toBe(true);
});
```

- [ ] **Step 5: Run everything**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: a forgotten timer no longer pins the app to yesterday"
```

---

### Task 7: `Goal` becomes `Project` — types, migration, store

**Files:**
- Create: `src/store/projects.ts`, `src/store/projectsMigrate.ts`,
  `src/store/projectsMigrate.test.ts`
- Delete: `src/store/goals.ts`
- Modify: `src/types/index.ts`, `src/utils/goal.ts` → `src/utils/project.ts`

**Interfaces:**
- Consumes: `effortPeriodKey(effort, anchor, dayEndHour)` (Task 2), renamed here
  to `targetPeriodKey(target: PeriodTarget, anchor: number, dayEndHour: number)`;
  `prunePeriods`.
- Produces:
  - `interface Project`, `interface PeriodTarget` (spec §1.1)
  - `useProjects` store: `projects`, `addProject(params)`, `updateProject(id, patch)`,
    `deleteProject(id)`, `reorderProjects(ids)`, `archiveProject(id)`,
    `commitTime(projectId, ms)`, `currentPeriodKey(projectId)`,
    `recomputeFrom(entries: TimeEntry[])` — used by phase 2's edits
  - `migrateGoalsV3(persisted: unknown): { projects: Project[] }`

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, replace `GoalOutcome`, `EffortTarget`, `GoalMilestone`
and `Goal` with `PeriodTarget` and `Project` exactly as written in spec §1.1.
Leave `GoalPeriod` alone — `'daily' | 'weekly' | 'custom'` is still the cadence.

- [ ] **Step 2: Write the failing migration test**

Create `src/store/projectsMigrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { migrateGoalsV3 } from './projectsMigrate';

const HOUR = 3_600_000;

const timeGoal = {
  id: 'g1', title: 'Learn to code', order: 0, createdAt: 1,
  outcome: { kind: 'time', targetHours: 100 },
  effort: { metric: 'time', amount: 10 * HOUR, period: 'weekly' },
  progress: { '2026-09-14': 4 * HOUR }, total: 4 * HOUR,
  milestones: [{ id: 'm1', label: 'first commit' }],
  deadline: '2026-12-31',
};

const countGoal = {
  id: 'g2', title: 'Ride 1,000 km', order: 1, createdAt: 2,
  outcome: { kind: 'count', unit: 'km', target: 1000 },
  effort: { metric: 'count', amount: 50, period: 'weekly' },
  progress: { '2026-09-14': 120 }, total: 120, milestones: [],
};

const openGoal = {
  id: 'g3', title: 'Read more', order: 2, createdAt: 3,
  outcome: { kind: 'open' }, progress: { '2026-09-14': 2 * HOUR }, total: 2 * HOUR, milestones: [],
};

describe('migrateGoalsV3', () => {
  it('carries a time goal\'s progress under the time metric', () => {
    const [p] = migrateGoalsV3({ goals: [timeGoal] }).projects;
    expect(p.name).toBe('Learn to code');
    expect(p.progress.time['2026-09-14']).toBe(4 * HOUR);
    expect(p.total.time).toBe(4 * HOUR);
  });

  it('keeps a time effort target and the deadline', () => {
    const [p] = migrateGoalsV3({ goals: [timeGoal] }).projects;
    expect(p.target).toEqual({ metric: 'time', amount: 10 * HOUR, period: 'weekly' });
    expect(p.deadline).toBe('2026-12-31');
  });

  it('drops milestones', () => {
    const [p] = migrateGoalsV3({ goals: [timeGoal] }).projects;
    expect(p).not.toHaveProperty('milestones');
  });

  it('does not read a count goal\'s numbers as milliseconds', () => {
    const [p] = migrateGoalsV3({ goals: [countGoal] }).projects;
    expect(p.progress.time).toEqual({});
    expect(p.total.time).toBe(0);
    expect(p.target).toBeUndefined();
  });

  it('keeps an open goal\'s banked time', () => {
    const [p] = migrateGoalsV3({ goals: [openGoal] }).projects;
    expect(p.total.time).toBe(2 * HOUR);
  });

  it('preserves order and survives an empty store', () => {
    const { projects } = migrateGoalsV3({ goals: [timeGoal, countGoal, openGoal] });
    expect(projects.map((p) => p.id)).toEqual(['g1', 'g2', 'g3']);
    expect(migrateGoalsV3({}).projects).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm run test:unit src/store/projectsMigrate.test.ts`
Expected: FAIL — cannot resolve `./projectsMigrate`.

- [ ] **Step 4: Implement the migration**

Create `src/store/projectsMigrate.ts` implementing spec §1.1's migration rules.
The one rule that is easy to get wrong: a goal's `progress` moves under
`progress.time` **only** when it was time-flavoured —
`outcome.kind === 'time' || outcome.kind === 'open'`, **and**
`effort?.metric !== 'count'`. Anything else starts at `{}` / `0`, because those
numbers are kilometres, not milliseconds.

- [ ] **Step 5: Create the store**

Create `src/store/projects.ts` from `goals.ts`, with:
`goals` → `projects`, `title` → `name`, `commitTime` writing to
`progress.time[key]` and `total.time`, and `logCount`, `completeGoal`, and the
four milestone actions deleted. Key stays `tt-goals`, `version: 4`, `migrate`
delegating to `migrateGoalsV3` for `version < 4`. Add:

```ts
/**
 * Re-sum a project's period buckets from the ledger. Retroactive edits to the
 * timeline recompute rather than patch — a delta that is ever computed against
 * a stale entry is a wrong total that nothing will ever correct.
 */
recomputeFrom: (entries: TimeEntry[]) => void;
```

Rename `src/utils/goal.ts` → `src/utils/project.ts`, keeping the period and pace
helpers and deleting the milestone and lineage ones.

- [ ] **Step 6: Run the unit tests**

Run: `npm run test:unit`
Expected: PASS. `npm run build` still fails on the UI — Task 8.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: goals become projects, with time-keyed progress"
```

---

### Task 8: The Projects tab

**Files:**
- Rename: `GoalList.tsx` → `ProjectList.tsx`, `GoalCard.tsx` → `ProjectCard.tsx`,
  `GoalForm.tsx` → `ProjectForm.tsx`
- Delete: `src/components/GoalMetDialog.tsx`
- Modify: `src/App.tsx`, `src/store/settings.ts` (`TabId`), `src/types/index.ts`
- Modify: `e2e/goals.spec.ts` → `e2e/projects.spec.ts`, `e2e/tabs.spec.ts`

**Interfaces:**
- Consumes: `useProjects` (Task 7).
- Produces: `TabId = 'projects' | 'tasks' | 'activity'` (habits removed in Task 11;
  remove `'goals'` and add `'projects'` here, leave `'habits'` until then).

- [ ] **Step 1: Rewrite the e2e spec**

Rename `e2e/goals.spec.ts` to `e2e/projects.spec.ts` and rewrite it against the
new surface. It must cover:

```ts
test('a project needs only a name', async ({ app }) => {
  await switchTab(app, 'Projects');
  await app.getByRole('button', { name: 'New project' }).click();
  await app.getByLabel('Name').fill('Learn to code');
  await app.getByRole('button', { name: 'Create' }).click();
  await expect(app.getByRole('heading', { name: 'Learn to code' })).toBeVisible();
});

test('a project can carry a weekly target', async ({ app }) => {
  await switchTab(app, 'Projects');
  await app.getByRole('button', { name: 'New project' }).click();
  await app.getByLabel('Name').fill('Learn to code');
  await app.getByLabel('Target').fill('10');
  await app.getByLabel('per').selectOption('weekly');
  await app.getByRole('button', { name: 'Create' }).click();
  await expect(app.getByText('0h of 10h this week')).toBeVisible();
});

test('there are no milestones', async ({ app }) => {
  await switchTab(app, 'Projects');
  await app.getByRole('button', { name: 'New project' }).click();
  await expect(app.getByText('Milestone')).toHaveCount(0);
});
```

Delete every test in the old spec covering milestones, "goal met", evolve
lineage, or count outcomes.

In `e2e/tabs.spec.ts`, replace `'Goals'` with `'Projects'` and `'No goals yet'`
with `'No projects yet'`.

- [ ] **Step 2: Run and watch fail**

Run: `npx playwright test e2e/projects.spec.ts`
Expected: FAIL — no Projects tab.

- [ ] **Step 3: Rebuild the components**

`ProjectForm` collects name, colour, optional target (amount + `daily | weekly |
custom`), optional deadline. The milestone editor, the outcome picker and the
evolve branch are deleted. `ProjectCard` shows the name, a period readout
("4h 12m of 10h this week") when a target exists, the cumulative total, and the
deadline pace line when a deadline exists. Its action menu is Edit / Archive —
no "Mark met". Keep the existing card and form styling; this is a subtraction,
not a redesign.

- [ ] **Step 4: Run everything**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: a Projects tab, minus milestones and lineage"
```

---

### Task 9: One attribution path

**Files:**
- Modify: `src/store/session.ts`, `src/hooks/useFocusable.ts`,
  `src/components/SessionTimer.tsx`, `src/components/TaskList.tsx`,
  `src/components/ProjectCard.tsx`
- Modify: `src/types/index.ts` (delete `FocusTarget`)
- Create: `e2e/attribution.spec.ts`

**Interfaces:**
- Consumes: `setActive` (Task 5), `commitTime` (Task 7), `Task.projectId` (Task 10
  — this task may land first; guard with `task.projectId ?? undefined`).
- Produces: `useActiveTarget()` in `hooks/useFocusable.ts`, returning
  `{ projectId?: string; taskId?: string }`.

- [ ] **Step 1: Write the failing test**

Create `e2e/attribution.spec.ts`:

```ts
import { test, expect, switchTab, startWork, addTask } from './helpers';

test('time credits the project you picked', async ({ app }) => {
  await switchTab(app, 'Projects');
  await app.getByRole('button', { name: 'New project' }).click();
  await app.getByLabel('Name').fill('Learn to code');
  await app.getByRole('button', { name: 'Create' }).click();
  await app.getByRole('button', { name: 'Track time on Learn to code' }).click();

  await startWork(app);
  await app.waitForTimeout(2500);
  await app.getByRole('button', { name: 'Stop' }).click();

  const entries = await app.evaluate(
    () => JSON.parse(localStorage.getItem('tt-session')!).state.daily.entries
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].projectId).toBeTruthy();
});

test('switching target closes one entry and opens another', async ({ app }) => {
  await addTask(app, 'Write the parser');
  await startWork(app);
  await app.getByRole('button', { name: 'Track time on Write the parser' }).click();
  await app.waitForTimeout(2000);
  await app.getByRole('button', { name: 'Stop' }).click();

  const entries = await app.evaluate(
    () => JSON.parse(localStorage.getItem('tt-session')!).state.daily.entries
  );
  expect(entries.length).toBeGreaterThanOrEqual(2);
  expect(entries.at(-1).taskId).toBeTruthy();
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx playwright test e2e/attribution.spec.ts`
Expected: FAIL — no "Track time on …" control.

- [ ] **Step 3: Implement**

`setActive(projectId?, taskId?)` in the session store: if a work timer is
running, close the current entry at `now` and open a new one at `now` with the
new ids — switching target must not smear one entry across two projects. When
`taskId` is given, `projectId` is resolved from the task.

`stopWork` commits the finished entry's duration to its project via
`useProjects.getState().commitTime(projectId, ms)` and to its task via
`useTasks.getState().adjustTrackedMs(taskId, ms)`.

Delete `FocusTarget`, `isFocusable` and `pruneFocus`; `useFocusable.ts` becomes
`useActiveTarget()`. Task rows and project cards get a "Track time on X" toggle
in place of the old focus control.

- [ ] **Step 4: Run everything**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: one attribution path — a segment credits a project"
```

---

### Task 10: Tasks tag to a project

**Files:**
- Modify: `src/types/index.ts`, `src/store/tasks.ts` (v6 → v7),
  `src/components/TaskList.tsx`
- Modify: `e2e/tasks` coverage — add to `e2e/attribution.spec.ts`

**Interfaces:**
- Consumes: `useProjects` (Task 7).
- Produces: `Task.projectId?: string`; `useTasks().setTaskProject(id, projectId?)`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/attribution.spec.ts`:

```ts
test('a task tagged to a project credits that project', async ({ app }) => {
  await switchTab(app, 'Projects');
  await app.getByRole('button', { name: 'New project' }).click();
  await app.getByLabel('Name').fill('Learn to code');
  await app.getByRole('button', { name: 'Create' }).click();

  await switchTab(app, 'Tasks');
  await addTask(app, 'Write the parser');
  await app.getByRole('button', { name: 'Task actions' }).first().click();
  await app.getByRole('menuitem', { name: 'Project…' }).click();
  await app.getByRole('option', { name: 'Learn to code' }).click();
  await expect(app.getByText('Learn to code')).toBeVisible();

  await app.getByRole('button', { name: 'Track time on Write the parser' }).click();
  await startWork(app);
  await app.waitForTimeout(2500);
  await app.getByRole('button', { name: 'Stop' }).click();

  const entry = await app.evaluate(
    () => JSON.parse(localStorage.getItem('tt-session')!).state.daily.entries.at(-1)
  );
  expect(entry.projectId).toBeTruthy();
  expect(entry.taskId).toBeTruthy();
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npx playwright test e2e/attribution.spec.ts`
Expected: FAIL — no "Project…" menu item.

- [ ] **Step 3: Implement**

Add `projectId?: string` to `Task`; bump `tt-tasks` to `version: 7` with a
migrate branch that leaves existing tasks untouched (the field is optional —
the bump exists so the shape is declared). Add `setTaskProject`. In the task
row, show the project as a small coloured tag; add "Project…" to the action
menu. `deleteProject` in `projects.ts` clears `projectId` from that project's
tasks and leaves entries alone — entries record what happened.

- [ ] **Step 4: Run everything**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: a task can belong to a project"
```

---

### Task 11: Habits out, the recurrence engine kept

**Files:**
- Delete: `src/store/habits.ts`, `src/utils/habit.ts`,
  `src/components/Habit{List,Row,AddForm,FreqPicker,Adherence}.tsx`,
  `e2e/habits.spec.ts`
- Rename: `src/utils/habitFreq.ts` → `src/utils/recurrence.ts`
- Modify: `src/types/index.ts`, `src/utils/goalPeriod.ts`,
  `src/components/Activity.tsx`, `src/App.tsx`, `src/store/settings.ts`,
  `e2e/tabs.spec.ts`

**Interfaces:**
- Produces, for phase 3:
  - `type Recurrence = { kind: 'daily' } | { kind: 'weekly' } | { kind: 'everyN'; n: number } | { kind: 'weekdays'; days: number[] }`
  - `isDueOn(rule: Recurrence, anchorCreatedAt: number, date: Date): boolean`
  - `recurrenceLabel(rule: Recurrence): string`
  - `WEEKDAY_LABELS`, `WEEKDAY_SHORT`

- [ ] **Step 1: Write the failing unit test**

Create `src/utils/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isDueOn } from './goalPeriod';
import { recurrenceLabel } from './recurrence';

const anchor = new Date(2026, 8, 20).getTime(); // Sun 20 Sep 2026

describe('isDueOn', () => {
  it('takes a rule and an anchor, not a habit', () => {
    expect(isDueOn({ kind: 'daily' }, anchor, new Date(2026, 8, 25))).toBe(true);
  });

  it('honours weekdays (Mon=0)', () => {
    const rule = { kind: 'weekdays' as const, days: [0, 2] }; // Mon, Wed
    expect(isDueOn(rule, anchor, new Date(2026, 8, 21))).toBe(true);  // Mon
    expect(isDueOn(rule, anchor, new Date(2026, 8, 22))).toBe(false); // Tue
    expect(isDueOn(rule, anchor, new Date(2026, 8, 23))).toBe(true);  // Wed
  });

  it('counts everyN from the anchor', () => {
    const rule = { kind: 'everyN' as const, n: 3 };
    expect(isDueOn(rule, anchor, new Date(2026, 8, 20))).toBe(true);
    expect(isDueOn(rule, anchor, new Date(2026, 8, 21))).toBe(false);
    expect(isDueOn(rule, anchor, new Date(2026, 8, 23))).toBe(true);
  });

  it('is never due before the anchor', () => {
    expect(isDueOn({ kind: 'daily' }, anchor, new Date(2026, 8, 19))).toBe(false);
  });
});

describe('recurrenceLabel', () => {
  it('names the cadence', () => {
    expect(recurrenceLabel({ kind: 'daily' })).toBe('Daily');
    expect(recurrenceLabel({ kind: 'everyN', n: 3 })).toBe('Every 3 days');
    expect(recurrenceLabel({ kind: 'weekdays', days: [0, 2] })).toBe('Mon · Wed');
  });
});
```

Note the fourth `isDueOn` test: the old `isHabitDueOn` returned `true` for a
`daily` habit on any date including before it existed. Taking the anchor as a
parameter makes "not yet" expressible, which phase 3's future columns need.

- [ ] **Step 2: Run and watch fail**

Run: `npm run test:unit src/utils/recurrence.test.ts`
Expected: FAIL — `isDueOn` is not exported.

- [ ] **Step 3: Rename and re-sign**

`HabitFreq` → `Recurrence` in `types/index.ts`. `isHabitDueOn(habit, date)` →
`isDueOn(rule, anchorCreatedAt, date)` in `goalPeriod.ts`, taking the rule and
anchor directly and returning `false` for any date before the anchor's day.
`habitFreq.ts` → `recurrence.ts`, `freqLabel` → `recurrenceLabel`.
`isHabitOutstanding` is deleted — phase 3's grid asks a different question.

- [ ] **Step 4: Delete the rest**

Delete the habit store, `utils/habit.ts`, the five components, the Habits tab,
`e2e/habits.spec.ts`, and the habit adherence block in `Activity.tsx`.
`TabId` becomes `'projects' | 'tasks' | 'activity'`; `tt-settings` gains a
migrate branch mapping a stored `activeTab` of `'habits'` or `'goals'` to
`'tasks'`. **Leave the `tt-habits` localStorage key alone** — no code reads it,
and deleting user data in a migration is how data-loss bugs happen.

In `e2e/tabs.spec.ts`, drop the Habits cases and assert three tabs.

- [ ] **Step 5: Run everything**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: habits out, their recurrence engine kept for the schedule"
```

---

### Task 12: Documentation and the phase gate

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/2026-09-20-projects-and-schedule.md`

- [ ] **Step 1: Update the README**

Rewrite the Features list: projects with optional period targets, a time-entry
ledger, a derived break bank, a configurable end of day, tasks that tag to a
project. Remove routines, habits, goals, and "difficulty modes: Hard/Medium/Easy"
(the modes were renamed in PR #17 — say Locked in / Serious / Relaxed). Update
the Stack section: the stores are now `session`, `tasks`, `projects`, `settings`,
and `npm run test:unit` exists alongside `npm test`.

- [ ] **Step 2: Mark the phase**

In the spec, change the Status line to note that Phase 1 is implemented, with the
date, in the style of `2026-09-05-session-model.md`. Add a short "Found while
implementing" section for anything the plan did not anticipate.

- [ ] **Step 3: Full verification**

Run: `npm run build && npm run lint && npm run test:unit && npm test`
Expected: all green. Paste the actual output into the task report — a claim of
green without the output does not count.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: bring the README and the spec up to the built state"
```

---

## Verification summary

| Spec section | Task |
| --- | --- |
| §1.0 day boundary | 1, 2 |
| §1.1 Project type + migration | 7 |
| §1.2 TimeEntry + migration | 3, 4 |
| §1.3 derived bank | 3, 5 |
| §1.4 sessions go away | 5, 6 |
| §1.5 one attribution path | 9 |
| §1.6 tasks tag to a project | 10 |
| §1.7 habits removed, recurrence kept | 11 |
| §1.8 e2e table | 2, 5, 6, 8, 9, 10, 11 |
