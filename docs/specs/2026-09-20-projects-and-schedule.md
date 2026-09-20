# Projects, a day timeline, and a weekly schedule

**Status:** designed, not yet built.
**Supersedes** parts of `2026-09-08-redesign.md` (habits) and
`2026-09-05-session-model.md` (the session as a unit of work).

---

## Why

The app tracks time against *goals* and asks you to bracket work inside a
*session*. Real use is Toggl-shaped: a handful of long-lived **projects** you
pour hours into, some with a target per week, and a running timer you start and
stop without ceremony. The session bracket adds a step and earns nothing, and
habits — a flat list of boolean daily ticks — went unused because they sit
below the level anything is actually planned at.

So: goals become projects, sessions go away, habits go away, and the day's work
becomes an editable timeline you can correct when you leave a timer running.

## The shape, after

Three tabs: **Projects · Tasks · Activity**.

- A **Project** is a durable thing you spend time on. Optional target per
  period ("10h / week"), optional deadline. Time accrues to it forever.
- A **Task** is one thing to do on one day, optionally tagged to a project,
  optionally recurring. The Tasks tab is a week of columns.
- A **TimeEntry** is one uninterrupted stretch of work or break, with wall-clock
  start and end. Entries are the ledger; everything else is derived from them.

## Execution order

Sequential — each phase depends on the stores the one before it migrates.

| Phase | Scope | Stores touched |
| --- | --- | --- |
| 1 | The day boundary + projects + the time-entry ledger + derived bank | `tt-goals`, `tt-session`, `tt-tasks`, `tt-settings`, `tt-habits` (orphaned) |
| 2 | The editable day timeline | none (built on phase 1) |
| 3 | Weekly schedule: recurrence, views, project filter | `tt-tasks` |
| 4 | Per-day difficulty with a reduction quota | `tt-session`, `tt-settings` |

Phases 3 and 4 are independent of each other once 1 and 2 land.

Every phase ends green on `npm run lint`, `npm run build`, `npm test`.

---

# Phase 1 — Projects and the time-entry ledger

## 1.0 The day boundary is a setting (`tt-settings`, v8 → v9)

Every date key in the app comes from `todayKey()` / `dateKey()`, which cut the
day at midnight. Someone who works past midnight then has one evening split
across two days: the bank clears under them, the timeline breaks in half, and
the work lands on a day they were asleep for.

```ts
// tt-settings
dayEndHour: number;   // 0–4, local time. Default 0 (midnight).
```

Offered as midnight / 1 AM / 2 AM / 3 AM / 4 AM — a short list, not a free
field. Past 4 AM the notion of "yesterday" stops being useful and the pace
series would start folding two real days into one.

The whole app routes through one function:

```ts
// utils/thirdTime.ts
export function dayKeyOf(t: number, dayEndHour: number): string  // dateKey(t - dayEndHour hours)
export function todayKey(dayEndHour: number): string             // dayKeyOf(Date.now(), …)
```

`dayKeyOf` shifts the timestamp back by `dayEndHour` hours and then takes the
calendar date. At `dayEndHour: 2`, 01:30 on the 21st returns `2026-09-20` —
still last night.

Consequences, all in phase 1:

- `todayKey` and `tomorrowKey` gain the parameter. Every caller reads it from
  the settings store. They are not left with a midnight default: a silent
  fallback is how half the app would keep cutting at midnight.
- `dateKey(d)` in `goalPeriod.ts` stays a pure calendar helper — it is what
  `dayKeyOf` is built from — but nothing outside `dayKeyOf` may call it to ask
  "what day is it now".
- `getWeekKey` derives from the shifted key, so the week boundary moves with the
  day boundary.
- The day-turnover check in `App.tsx` fires at `dayEndHour`, not at 00:00.
- Changing the setting does **not** rewrite history. Archived entries keep the
  keys they were filed under; only days from that point on are cut the new way.
  A one-line note says so in Options.

## 1.1 `Project` replaces `Goal` (`store/goals.ts` → `store/projects.ts`, key `tt-goals`, v2 → v3)

```ts
export interface PeriodTarget {
  metric: 'time';                 // count is not offered; see 1.2
  amount: number;                 // ms
  period: 'daily' | 'weekly' | 'custom';
  periodDays?: number;            // custom only
}

export interface Project {
  id: string;
  name: string;
  color?: string;                 // swatch for the timeline and task tags
  target?: PeriodTarget;
  deadline?: string;              // YYYY-MM-DD; absent = no pace readout
  createdAt: number;
  order: number;
  /** metric → periodKey → amount. Time values are ms. */
  progress: { time: Record<string, number> };
  /** metric → running cumulative total, immune to `prunePeriods`. */
  total: { time: number };
  archivedAt?: number;
}
```

Removed from the old `Goal`: `milestones`, `evolvesFromId`, `doneWhen`,
`completedAt`, and the `outcome` union. Gone with them: `GoalMetDialog.tsx`,
`completeGoal`, `addMilestone`/`updateMilestone`/`deleteMilestone`/
`toggleMilestone`, `logCount`, and the evolve branch of `GoalForm`. A project
is never "met" — it is archived.

`GoalCard` → `ProjectCard`, `GoalList` → `ProjectList`, `GoalForm` →
`ProjectForm`, `utils/goal.ts` → `utils/project.ts` (keep the period-progress
and pace helpers; drop the milestone and lineage ones).

### Why `progress` is keyed by metric

The old shape was `progress: Record<periodKey, number>`, one bucket shared by
count progress and focused time — which is exactly why `isFocusable` refused
count goals. Every project must now be time-trackable, so the map is nested by
metric from the start. Count outcomes are **not** shipping in this pass, but
nesting now means adding them later is a feature, not a second migration.

### Migration (v2 → v3)

Per goal:

- `name` ← `title`; `createdAt`, `order`, `deadline`, `archivedAt` carry over.
- `progress` ← `{ time: old.progress }` when the goal was time-flavoured
  (`outcome.kind === 'time'` or `'open'`, and `effort?.metric !== 'count'`),
  else `{ time: {} }` — a count goal's numbers are not milliseconds and must
  not be read as such.
- `total` ← `{ time: <the same rule applied to old.total> }`.
- `target` ← `old.effort` when `effort.metric === 'time'`, else undefined.
- A goal with a `count` outcome still becomes a project; it simply arrives with
  no target and no time. Its old numbers stay in the persisted blob, unread.
- `milestones`, `evolvesFromId`, `doneWhen`, `outcome`, `completedAt` are left
  in the persisted record and not carried into the type. **No field deletion**
  — repo convention, and stale keys cost nothing.

## 1.2 `TimeEntry` replaces `SessionLog` (`tt-session`, v3 → v4)

```ts
export interface TimeEntry {
  id: string;
  kind: 'work' | 'break';
  startedAt: number;              // wall clock ms
  endedAt: number;                // wall clock ms; > startedAt
  projectId?: string;             // work only
  taskId?: string;                // work only; implies the task's projectId
  mode: Mode;                     // the ratio in force when this was earned
}
```

Duration is `endedAt - startedAt` and is **never stored**. There is no
`workMs`/`breakMs` on an entry; a second copy of the same fact is a second
thing to keep in sync through retroactive edits.

`DailyState` becomes:

```ts
export interface DailyState {
  date: string;
  entries: TimeEntry[];
}
```

Gone: `bankMs` (now derived — 1.3), `sessions`, `sessionStartedAt`,
`unusedRestMs` (now derived at archive — 1.4).

### Migration (v3 → v4)

Each `SessionLog { workMs, breakMs, mode, startedAt }` splits into up to two
entries, in this exact arithmetic:

```
work:  [startedAt,            startedAt + workMs]
break: [startedAt + workMs,   startedAt + workMs + breakMs]
```

A zero-length half is dropped. `projectId`/`taskId` are absent — the old model
did not record them. This applies to `daily.sessions` and to
`HistoryEntry.sessions` for every archived day. `HistoryEntry` keeps
`totalWorkMs`/`totalBreakMs`/`unusedRestMs` as-is (the values are already
correct) and renames `sessions` → `entries`.

Getting this arithmetic wrong silently corrupts every past timeline, so it gets
its own unit-level e2e check with a hand-built fixture.

## 1.3 The bank is derived, not stored

```ts
// utils/thirdTime.ts
export function bankOf(entries: TimeEntry[], open?: OpenSegment, now?: number): number
```

`bank = Σ earnBreak(duration, entry.mode) over work entries − Σ duration over
break entries`, plus the open segment if a timer is running.

The open segment is folded in as a **virtual entry** `{ kind, startedAt:
timerStart, endedAt: now, mode }`, so the balance ticks live off the existing
`useNow` second clock rather than freezing until the timer stops. `BreakBank`
and `SessionTimer` read `bankOf(...)` instead of `daily.bankMs`.

This is what makes retroactive editing trustworthy: trim a work block and the
break it earned disappears with it, by construction, with no delta arithmetic
anywhere.

Each entry carries the `mode` in force when it ran, so changing difficulty
never rewrites what you already earned.

## 1.4 Sessions go away

- `endSession`, `SessionReport`, `EndSessionModal.tsx`, `sessionClosedAt`,
  `RestoreSessionModal`'s "start a new session" wording, and
  `daily.sessionStartedAt` are all removed.
- **The bank clears at day turnover** — at `dayEndHour`, not necessarily
  midnight — in `maybeArchivePreviousDay`.
- `unusedRestMs` is computed once, at archive time, as
  `max(0, bankOf(daily.entries))`. It stops being a running total.
- The archive guard relaxes: it currently refuses while `timerState !== 'idle'`,
  which with no End Session button would let a forgotten overnight timer pin the
  app to yesterday indefinitely. New rule: **if a timer has been running across
  a day boundary, close its entry at the boundary of the day it started**,
  archive that day, and open a fresh entry of the same kind and project for
  today. The timeline then shows an honest (if long) block on each day, which
  the user can trim in phase 2.
- The day summary that `EndSessionModal` used to show has no trigger left. It is
  not replaced: `Activity`'s selected-day card already shows the same numbers.

## 1.5 One attribution path

`FocusTarget` (`task | goal`) and the two-branch `commitFocusSegment` are
replaced by a single field on the running timer:

```ts
activeProjectId?: string;
activeTaskId?: string;            // when set, projectId comes from the task
```

Stopping a work timer writes one entry carrying both ids. Project totals are
then a **derived rollup over entries** — `Σ duration where projectId === p` —
committed into `project.progress.time[periodKey]` and `project.total.time` at
the moment the entry closes, so the existing period/pace readouts keep working
unchanged.

Retroactive edits (phase 2) must re-commit: the rule is that changing an entry
**recomputes** the affected project buckets rather than patching them by delta.
See 2.3.

`isFocusable` collapses to "the project exists and is not archived" / "the task
exists and is not done". `pruneFocus` keeps its job under the new field names.

## 1.6 Tasks tag to a project (`tt-tasks`, v+1)

`Task` gains `projectId?: string`. Nothing else changes in this phase.
`Task.trackedMs` stays: it is the per-task readout, and it is now a cached
rollup of that task's entries, maintained by the same recompute rule as 1.5.

Deleting a project clears `projectId` from its tasks and leaves its entries'
`projectId` dangling-safe (rendered as "no project"). Entries are never deleted
by a project deletion — they are what actually happened.

## 1.7 Habits are removed

Deleted: `store/habits.ts`, `utils/habit.ts`, `HabitList`, `HabitRow`,
`HabitAddForm`, `HabitFreqPicker`, `HabitAdherence`, the `habits` tab, and the
adherence block in `Activity`. `e2e/habits.spec.ts` goes with them.

**Kept and renamed**, because phase 3 needs exactly this and it is already
written and tested:

| Now | Becomes | Where |
| --- | --- | --- |
| `HabitFreq` | `Recurrence` | `types/index.ts` |
| `isHabitDueOn(habit, date)` | `isDueOn(rule, anchorCreatedAt, date)` | `utils/goalPeriod.ts` |
| `freqLabel` | `recurrenceLabel` | `utils/recurrence.ts` (was `habitFreq.ts`) |
| `WEEKDAY_LABELS`, `WEEKDAY_SHORT` | unchanged | same file |

`isDueOn` loses its dependency on a `Habit` object and takes the rule plus an
anchor timestamp, so a recurring task can use it. `utils/habit.ts`'s
`dotStates` is **not** kept — its weekly-collapse and target-amount logic is
habit-row-specific.

The `tt-habits` localStorage key is left untouched.

## 1.8 Phase 1 e2e

| Behaviour | Check |
| --- | --- |
| Migration split | a fixture `SessionLog` becomes work `[t, t+w]` + break `[t+w, t+w+b]` |
| Migration, goals | a time goal's progress lands under `progress.time`; a count goal's does not |
| Derived bank | bank reads the same number after a reload with no stored `bankMs` |
| Live bank | bank advances every second while a work timer runs |
| Attribution | starting a timer on a task credits the task's project |
| Day turnover | bank is 0 after rollover; unused rest recorded on the archived entry |
| Timer across the boundary | yesterday archived; a fresh entry continues today |
| `dayEndHour: 2` | work logged at 01:30 files under the previous day |
| `dayEndHour: 2` | the turnover fires at 02:00, not 00:00 |
| Changing `dayEndHour` | archived days keep the keys they were filed under |
| No sessions | no End Session control anywhere in the UI |

---

# Phase 2 — The day timeline

## 2.1 What it is

A vertical wall-clock column for one day — the Activity tab's selected day,
today by default. Blocks are positioned and sized by `startedAt`/`endedAt`,
coloured by project, labelled with project and task. Breaks render in the break
colour; untracked gaps render as empty rail. It replaces `DayShape` in
`Activity.tsx`, which already draws sorted blocks from the same array.

The running entry, if any, is drawn as a live block that grows.

## 2.2 Editing

Tap a block to open an editor with: start time, end time, project, task,
delete. Drag on empty rail to create an entry you forgot to start.

Rules:

- Entries never overlap. Editing clamps against the neighbours on either side;
  an edit that would swallow a neighbour is refused, not silently destructive.
- `endedAt > startedAt` always; a zero-length entry is deleted instead.
- An entry cannot be moved across a day boundary. Split it instead.
- Split cuts one entry into two at a chosen time, both keeping kind, project and
  mode.
- Past days are editable on the same terms.

## 2.3 The recompute rule

**Stored aggregates are always recomputed from entries, never patched by delta.**
Any mutation of a day's entries triggers, for that day:

1. `HistoryEntry.totalWorkMs` / `totalBreakMs` ← re-summed from its entries
   (`unusedRestMs` is left as archived; it records what the bank held at
   turnover and is not re-derivable after the fact).
2. Every affected project's `progress.time[periodKey]` and `total.time` ←
   re-summed from all entries in that period, across `daily` and `history`.
3. Every affected task's `trackedMs` ← re-summed from its entries.

Today's bank needs no step: it is already derived (1.3).

This rule is why phase 1 keeps duration off the entry and derives the bank.
Delta-patching a retroactive edit is where this feature would otherwise rot.

`pace.ts` reads `HistoryEntry.totalWorkMs` and therefore picks up corrections on
the next read, with no changes of its own.

## 2.4 Phase 2 e2e

| Behaviour | Check |
| --- | --- |
| Render | a day with three entries draws three blocks in wall-clock order |
| Trim | shortening a work block lowers the bank by the break it had earned |
| Trim, project | the same edit lowers that project's period progress |
| Trim, archived day | the archived `totalWorkMs` is re-summed, not patched |
| Overlap | an edit that would overlap a neighbour is refused |
| Manual add | dragging empty rail creates an entry that earns break time |
| Reassign | moving an entry to another project moves the time with it |
| Live block | the running entry grows on the shared second clock |

---

# Phase 3 — The weekly schedule

## 3.1 Views

The Tasks tab becomes seven day columns with a view toggle:

- **This week** — Monday to Sunday of the current week.
- **Rolling** — today plus the next six days.

Plus a project filter (all / one project / no project) that applies to both.

## 3.2 Recurrence is virtual

A recurring task is a **rule**, not a spawned row — "today + next 6 days" must
render occurrences that do not exist yet, which the old `spawnDueRoutines` /
`lastSpawnKey` materialisation structurally cannot do.

```ts
export interface RecurringTask {
  id: string;
  title: string;
  projectId?: string;
  rule: Recurrence;               // daily | weekly | everyN | weekdays (1.7)
  createdAt: number;              // the everyN anchor
  order: number;
  /** dateKey → true when that occurrence was completed. */
  completions: Record<string, true>;
  /** dateKey → true when that occurrence was skipped for this date only. */
  skipped?: Record<string, true>;
  endedAt?: number;               // stop generating occurrences after this
}
```

A day column renders its one-off `Task`s plus every `RecurringTask` for which
`isDueOn(rule, createdAt, day)` holds and `day` is not skipped. Ticking an
occurrence writes `completions[dateKey] = true`.

`completions` is pruned on the same terms as `progress` (`prunePeriods`).

## 3.3 Overdue

Unfinished **one-off** tasks stay in the column of the day they were scheduled
for, greyed as missed — the week reads as honest history. `rolloverPastTasks`
and `CarriedOverModal` are removed.

Today's column gains an **Overdue (N)** strip listing them, with one-click
reschedule to today. The strip is the only way overdue work surfaces in Rolling
view, where past days are not drawn.

A missed **recurring** occurrence is never overdue. It is simply not done; the
next occurrence stands on its own.

## 3.4 Phase 3 e2e

| Behaviour | Check |
| --- | --- |
| Views | This week shows Mon–Sun; Rolling starts at today |
| Virtual occurrences | a `weekdays: [Mon, Wed]` rule draws in future columns |
| Completion | ticking a future occurrence marks that date only |
| Skip | skipping one occurrence leaves the next one due |
| Overdue strip | an unfinished past task appears in the strip, not in today's column |
| Overdue, recurring | a missed recurring occurrence never enters the strip |
| Filter | filtering by project hides tasks of other projects in every column |

---

# Phase 4 — Difficulty per day

## 4.1 The day's mode

`Mode` moves out of `tt-settings` as a single global value and into the day:

```ts
DailyState.mode: Mode;              // chosen at the day's first timer start
DailyState.reductionsUsed: number;  // count of downward changes today
```

Both are archived onto `HistoryEntry`, so the trend can read what you actually
worked at. `tt-settings` keeps `mode` as the **default** for a new day, plus:

```ts
difficultyPolicy: { kind: 'free' } | { kind: 'quota'; perDay: number };
```

Default `{ kind: 'quota', perDay: 1 }`.

Phase 1 already puts `mode` on each `TimeEntry`, so a change part-way through a
day is non-retroactive with no further work and **no second migration**.

## 4.2 The recommendation

`utils/pace.ts` already computes the acute:chronic band and its `verdict`, and
is lapse-aware after PR #17. No new heuristic:

- The day's mode picker shows a recommended option derived from the current
  verdict — below band → suggest a harder ratio, above band → suggest an easier
  one, within band → suggest yesterday's.
- **Lowering** difficulty is always allowed under `free`, and consumes a
  reduction under `quota`; at zero left, the harder options stay selectable and
  the easier ones are disabled with the reason shown.
- **Raising** is never blocked. When the verdict is above band, a one-line
  confirmation appears first — "you have been ramping fast lately" — and then
  it proceeds.

## 4.3 Phase 4 e2e

| Behaviour | Check |
| --- | --- |
| Per-day | a new day starts at the settings default, not yesterday's choice |
| Quota | a second reduction in one day is refused with a reason |
| Free | the same change succeeds under the free policy |
| Non-retroactive | entries recorded before a change keep their old ratio's earnings |
| Warning | raising above the band shows the confirmation, then proceeds |
| Archive | the day's mode and reductions land on the history entry |

---

## Out of scope

- Count outcomes on projects (the progress map is shaped for them; the UI is
  not built).
- Sub-day project targets beyond `daily | weekly | custom`.
- Importing or exporting time entries.
- A rename of the app.

## Conventions

Every store shape change bumps `version` and extends `migrate`. Field removals
leave the stale keys in the persisted blob — migrations that delete data are
where data-loss bugs come from. Each behaviour in the tables above gets an
`e2e` test, mutation-checked: break it on purpose and watch it go red.
