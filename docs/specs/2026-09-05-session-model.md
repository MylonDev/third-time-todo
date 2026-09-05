# Sessions, not days — plus two removals

**Status:** implemented
**Scope:** B, C and E from the product discussion. A (the pace band) is
deliberately left out so it can be reworked or dropped without disturbing
any of this. D was resolved as "leave as is".

---

## Why

The app is day-shaped. The actual usage is session-shaped: several sessions
a day, and ending one means "I'm taking a break", not "I'm done".

That mismatch is not only cosmetic. It produces two real defects, both in
`src/store/session.ts`, and it makes the end-of-day modal ask a day-scoped
question (what to do with unfinished tasks) every time a session ends.

---

## 1. The session/day model

### 1.1 What a session is

A session runs from the first `startWork` after an idle bank until
`endSession`. It may contain any number of work/break stints — a
`SessionLog` is one stint, not one session.

Add `sessionStartedAt?: number` to `DailyState`, set on `startWork` when no
session is open, cleared by `endSession`. Optional field, so **no migration
and no version bump**.

### 1.2 End Session

`End Day` becomes `End Session`. It:

- stops whatever timer is running
- **clears the accrued break time** (bank → 0) — confirmed intent
- adds this session's unused rest to today's running total
- shows a summary of *this session*, with today's total as a secondary line
- **does not archive the day**

### 1.3 The day ends by itself

Archiving moves out of `endSession` into one guarded operation:

```
maybeArchivePreviousDay():
  if daily.date is not today
  and daily.sessions is non-empty
  and no session is currently open
    -> archiveDay(); daily = freshDay()
```

Called on app mount, from the existing midnight timer in `App.tsx`, at the
top of `startWork`, and at the end of `endSession`.

A session open across midnight is **not** split: it keeps accruing to the
day it started on, and that day is archived once the session ends. This is
what "if a session is not currently ongoing" buys.

### 1.4 Defect: unused rest is overwritten, not accumulated

`archiveDay` (`session.ts:85`) writes `unusedRestMs: Math.max(0, daily.bankMs)`
and replaces today's history entry wholesale. End two sessions in one day
and the first session's unused rest is silently dropped from the archive.
Work and break totals are unaffected — they sum `daily.sessions`.

Fix: `daily.unusedRestMs` becomes a **running total for the day**, added to
on each `endSession` rather than sampled at archive time. `archiveDay` then
records that total.

`DailyState.unusedRestMs` is already `number | undefined`, so the type does
not change. The stored value is transient (today only), so no migration.

### 1.5 Defect: a session crossing midnight discards the previous day

`stopWork` and `stopBreak` both do:

```ts
const base = daily.date === today ? daily : freshDay();
```

Start work at 23:50 and stop at 00:10 and `base` becomes a fresh day —
yesterday's `sessions` are replaced, never archived. The data is gone.

Fix: those two must not silently reset the day. With 1.3 in place, the day
boundary is handled in one place; `stopWork` and `stopBreak` should write to
`daily` as it stands and leave rollover to `maybeArchivePreviousDay`.

### 1.6 Copy and colour

`EndSessionModal` currently warns in `--color-debt`:

> Your banked rest of X will be cleared. Take it before you end the day if
> you want it.

...and then the report highlights the same quantity as a positive. Ending a
session with rest unspent means the pace was sustainable. Replace with a
neutral statement in muted text, no debt colour, no "take it or lose it".

---

## 2. Task triage moves to the new day

`rolloverPastTasks` already moves unfinished, non-routine tasks to today,
silently, on open. The triage step (tomorrow / done / discard) currently
fires inside `EndSessionModal`, which under the new model runs several times
a day.

Move it: when a rollover actually carries tasks over, offer the triage once,
on that open.

- `rolloverPastTasks` returns the ids it moved.
- `App` holds them in local state and shows the triage when non-empty.
- Dispositions become `keep` (default) / `mark-done` / `discard`.
  `TaskDisposition` is transient UI state, never persisted, so this is a
  free rename. The `moveToTomorrow` store action stays — the task menu
  still uses it.

No "already triaged today" flag is needed: the prompt appears only on the
open that performs the move, and the default has already been applied.

---

## 3. Removals

### 3.1 `Task.estimateMin`

Collected, displayed, never read by any logic — never compared against
`trackedMs`, which is the only comparison that would justify it. Remove the
field from `Task`, the add-task and edit inputs, and the display.

### 3.2 `Goal.deadline`

Same: collected, displayed, never affects ordering, urgency or warnings.
Remove from `Goal`, the add and edit forms, and the display.

**Persisted data is left in place.** Migrations that delete fields are where
data-loss bugs come from, and a stale key costs nothing.

### 3.3 The routine streak

`RoutineAdherence` computes and shows "N in a row". Streaks punish the
missed period, which works against the point, and `snoozedUntil` is already
the right escape valve. Remove the streak; keep the adherence percentage
and the 14-period grid.

---

## Out of scope

- **A**, the acute:chronic pace band. Separate, later, removable.
- **D**. Goals and routines stay as they are.
- History retention stays at 30 days; raising it is part of A.

---

## Verification

Every change below gets an `e2e` test, each mutation-checked — break it on
purpose, watch it go red — per `CLAUDE.md`.

| Behaviour | Test |
| --- | --- |
| End Session clears the bank | bank reads 0 after ending |
| End Session does not archive | history has no entry for today |
| Two sessions in a day | unused rest is the **sum**, not the last one |
| Day rolls over while idle | previous day archived exactly once |
| Session open across midnight | not split; archived once it ends |
| Session across midnight | previous day's sessions still present (1.5) |
| Triage | appears on the carrying-over open, not at session end |
| Triage default | dismissing keeps the tasks in today |
| Removals | no estimate input, no deadline field, no streak |

`npm run lint`, `npm run build` and `npm test` all green before merge.

---

## Found while implementing

Two things the spec did not anticipate, both fixed:

**`clearTimer` left the session open.** "Reset — start a new session" on the
restore prompt set the timer idle but left `sessionStartedAt` set, so the
next session's summary covered the abandoned one's stints as well as its
own. It now closes the session.

**StrictMode cleared the triage before it rendered.** The mount effect runs
twice in development; the second `rolloverPastTasks()` finds nothing left to
move and returned an empty list, which overwrote the first result. The
effect now only ever widens the list.

## Judgement call

The session summary leads with *this session* and shows today's total
underneath, on the grounds that a button named End Session should report the
session. Easy to flip.

## Not covered by a test

`maybeArchivePreviousDay` keys off `timerState` alone. An earlier draft also
refused when `sessionStartedAt` was set; with `clearTimer` fixed, no UI path
reaches "idle with a session still open", so both versions behave
identically and no test distinguishes them. Kept the simpler one.
