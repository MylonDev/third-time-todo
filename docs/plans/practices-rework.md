# Practices rework: targets instead of levels, and no small steps

**Goal:** A practice is just a name and a target (which days, how many minutes a day), picked from five templates or set by hand. The small step, low-day step and Clarity/Energy tags go, from the form, the code and the spec. A day counts by the minutes spent, so the target ties into Timed and Flow alike.

Inserted before epic 4. Kata: a new epic "Practices rework" with one issue. Two spec-level rewrites ride along in kata: `9xes` (Return card) and `0m5y` (Suggest steps).

## Decisions

- **Form is Name plus a template row** (Paused, Minimal, Light, Steady, Serious, Custom). Custom reveals the fields: days a week (1 to 7), an optional "Specific days" toggle with Mon to Sun chips, and minutes a day. User's answer.
- **Dropped entirely:** small step, low-day step, Clarity/Energy tags, from form, types, rows, utils, tests and spec. "Just Name and Level, drop the rest from the spec too." User's answer. `nextStep` stays: it is a different feature.
- **A day counts by accumulated minutes** (Focus plus Timed on that practice in that day's window reaches the daily minutes), across any mix of Flow and Timed. The "session" concept goes. User's answer (Option 1).
- **Templates are only presets and nothing stores the level.** A practice stores `targetDays` (0 to 7), `targetWeekdays` (0 = Monday to 6; empty = any day) and `targetMin`. `templateOf(target)` matches only when `targetWeekdays` is empty and days and minutes equal a template; otherwise it is `null` (Custom). Paused is exactly `{0 days, 0 min}`. Picking a template sets all three values, clearing the weekdays. Custom days run 1 to 7 (zero is only Paused) and Custom minutes 1 to 600 (the Timed length limit, `MAX_MINUTES` in `TimedStart.tsx`, so the preset is always valid).
- **Template values are the old counting minimums:** Minimal 1 day x 10 min, Light 3 x 15, Steady 4 x 20, Serious 6 x 30. **Default (unanswered):** this keeps what already counted as a session, so no practice's bar moves. Weekly cost is now days x minutes: 10, 45, 80, 180 (was 15, 50, 90, 180).
- **Specific days:** with weekdays chosen, `targetDays` equals their count: toggling a chip sets the count, and the days control is replaced by that count while chips are on (turning "Specific days" off keeps the count and clears the chips). **Default (unanswered):** a qualifying day on any weekday counts toward the week, so a missed chosen day can be made up on another. Chosen weekdays decide two things in Needs attention. (a) "Due today": only for a practice with weekdays that include today, still short of its week (`left > 0`) and short of today's minutes; those sort first. A practice with no chosen weekdays has no due tier, so its order is today's order. (b) `daysLeft` is the chosen weekdays remaining, today included; when none remain it falls back to the days left in the week, so a missed day can still be made up.
- **Cap:** a practice costs `targetDays x targetMin` minutes a week. The rule is unchanged: a practice may always keep or lower its cost, never raise it past the cap. In the editor, a template that does not fit is disabled; for Custom, an over-cap target shows the existing warning and disables Save.
- **Low effort day goal** (spec) **Default (unanswered):** "Non-zero: some time on any practice, or one get-ready item". `9xes` becomes "offer the top needs-attention practice, as a Timed session of its daily target, or a get-ready item".
- **Data compat:** new migration adds `target_days integer not null default 0 check (target_days between 0 and 7)`, `target_weekdays smallint[] not null default '{}'` (each element 0 to 6), `target_min integer not null default 0 check (target_min between 0 and 600)` to `practices`, backfills them from `level` (paused 0/0, minimal 1x10, light 3x15, steady 4x20, serious 6x30), and gives `level` a `default 'paused'` while keeping it `NOT NULL` and its check, so an old client never reads a null level. The old columns (`level`, `small_*`, `low_*`, `*_needs`) are left in place, unused; new clients stop sending them, so a row a new client creates carries `level = 'paused'` and old clients show it as Paused. **Accepted limits for a stale cached build:** its edits to a row change only the old columns, so new builds ignore them (a PostgREST upsert writes only the named columns, so `target_*` are untouched); a row it creates reads as Paused on a new build until edited. A reload fixes both.
- **Local persisted store** `tt2-practices` goes 1 to 2, with a migrate that derives the target from `level` (an unknown or missing level becomes Paused), drops the removed fields and keeps tombstones and `nextStep`. The backfill and the local migrate give a practice equal `updatedAt` on both sides, so a pulled row and a migrated local row converge (tested).
- **A day's minutes are clipped to the day window** (as `practiceTime` already does), so a stint crossing the day end splits across the two days. The old session rule counted a session in the day it began.

## Design

New in `src/types.ts`: `Practice` loses `level`, `smallStep`, `lowStep`, `smallNeeds`, `lowNeeds` and gains `targetDays: number`, `targetWeekdays: number[]`, `targetMin: number`. `PracticeLevel` and `Need` go.

`src/utils/practices.ts`:

- `TEMPLATES` (replaces `LEVELS`): key, label, days, minutes. `TEMPLATE_ORDER` replaces `LEVEL_ORDER`. `templateOf(target)` returns the matching key or `null`. `targetOf(template)`.
- `weekCost(target)` = days x minutes. `plannedMinutes` sums it. `levelOverBy`/`levelFits` become `targetOverBy`/`targetFits(practices, id, target, cap)` with the same keep-or-lower rule.
- `describeTarget(target)` for the list: "Steady · 4 days a week · 20 min", "Mon Wed Fri · 30 min", "Paused". `targetHint` for the template button ("4 days · 20 min"). `isPaused(p)` (0 days) replaces `level === 'paused'`.
- `dayMinutes(entries, practiceId, dayWindow, now)` is `practiceTime` on one day; `countedDays(entries, practice, weekWindow, now, dayEndHour)` returns the week's qualifying day keys (walk `shiftDayKey` from the Monday, 7 days, `windowOf` each; reuse `practiceTime`).
- `needsAttention`: `done` = qualifying days this week; `left = targetDays - done`; `daysLeft` as in Decisions. Rank: due-today-and-unmet first, then `left / daysLeft`, then least recently practised, then order. `last` is the start of the practice's latest Focus or Timed entry that is live, non-zero length and not `want`: the same filter `firstSessionAt` uses, so Rest never counts as practising. `countedDays` filters the entries once to the practice and the week, then buckets by day, because `NeedsAttention` recomputes on every clock tick.
- `practiceSessions` / `countedSessions` / `PracticeSession` are deleted; `last` no longer uses them.
- `PracticeFields` becomes `{ name, targetDays, targetWeekdays, targetMin }`.

`src/sync/rows.ts`: `PracticeRow` drops `level`/`small_*`/`low_*`/`*_needs`, gains `target_days`, `target_weekdays`, `target_min`; the row-to-practice mapper tolerates a missing target (reads as paused). `src/store/practices.ts`: version 2 plus migrate.

UI: `PracticeEditor.tsx` (Name, `Segmented` of templates with hints as today, Custom fields; keeps the cap warning and delete flow), `PracticesView.tsx` (`describeTarget`, `isPaused`), `TimerPanel.tsx` (the For picker's "(paused)" and `TimedStart` preset use `targetMin`), `NeedsAttention.tsx` ("2 of 4 days this week · 3 days left").

## Tasks

- [ ] **1. Model, logic, sync and migration** (sonnet)
  - Files: `src/types.ts`, `src/utils/practices.ts`, `src/utils/practices.test.ts`, `src/store/practices.ts`, `src/sync/rows.ts`, `src/sync/rows.test.ts`, `src/sync/engine.test.ts`, new `supabase/migrations/20261019190000_practice_targets.sql`
  - Acceptance: the new types and helpers above exist with the unit tests rewritten for them: `templateOf` (the four values, Paused = 0/0, weekdays set means Custom), cost, cap keep-or-lower (a Custom cost over the cap can still save an unchanged or lower target), day counting across a Flow plus Timed mix, across the day end and with a running entry crossing the target, a `dayEndHour` change re-windowing past days, needs-attention ranking (due today, specific weekdays with a made-up day on another weekday, no due tier without weekdays, `last` ignoring Rest and zero-length entries), store migrate v1 to v2 (tombstones and `nextStep` kept, unknown level to Paused), row round-trip, an old-style row with no target, and a pulled row and a migrated local row converging; the removed fields are gone everywhere in `src/` outside the UI files; the migration is written and not applied.
  - Verify: `npm run test:unit` and `npm run lint`. **This commit alone does not build** (the UI files still use the old model until task 2), so it is never pushed or shipped alone; the PR head after task 2 is what has to be green.
- [ ] **2. Editor, list, timer and e2e** (sonnet), after 1
  - Files: `src/components/PracticeEditor.tsx`, `PracticesView.tsx`, `TimerPanel.tsx`, `NeedsAttention.tsx`, `e2e/helpers.ts` (its `Level` type, `pickLevel` and `addPractice` take a template and use the template group name), `e2e/practices.spec.ts`, `e2e/sync.spec.ts` (the row payload asserts `target_*`; the cap-total expectations use the new 10/45/80/180 costs)
  - Acceptance: add with just a name and a template; Custom reveals days, Specific days chips and minutes, and flips back to a template chip when chosen; over-cap Custom shows the warning and blocks Save; the list, For picker, Timed preset and Needs attention use the new wording; the e2e tests for steps, levels and sessions are rewritten, none deleted without a replacement.
  - Verify: `npm run format:check`, `npm run lint`, `npm run knip`, `npm run build`, `npm run test:unit`, `rtk proxy npm test`, and `rtk proxy grep -rniE "small step|low-day|clarity|energy" src e2e` returns nothing
- [ ] **3. Spec and kata** (me)
  - Files: `docs/specs/2026-10-18-product-concept.md`, kata `9xes`, `0m5y`
  - Acceptance: the Practices section describes targets and templates and the minutes-a-day rule; the small step bullet and the clarity/energy matching sentence are gone; the Low row and the Return card wording match the decisions above; `9xes` and `0m5y` rewritten to match; one kata epic and one issue created, the issue closed with the commit.
  - Verify: `npm run format:check`; `rtk proxy grep -niE "small step|low-day|clarity|energy|sessions a week" docs/specs/2026-10-18-product-concept.md` finds only what the decisions keep (the daily check's "Mental clarity" question stays); read the section through once.
- [ ] **4. Review, preview and ship** (me), after 1 to 3
  - Re-run the six checks, preview the editor at 390 px in light and dark (templates, Custom, over-cap), run `feature-lite:reviewer` once on the diff, **ask before applying the migration to project `adsovripnuawbofptgml`** (it must be live before the PR merges), ask before pushing, open the PR `epic/practices-rework` to `main`, merge once the migration is live.

## Out of scope

Multiple sessions a day as a separate target (a higher daily minute count covers it); the Return card, Daily check and Suggest steps themselves (their issues are only reworded); dropping the old columns; the lockfile fix (`vmzh`); the leftover branch and worktree cleanups.

## Process notes

- Plan reviewed by `feature-lite:reviewer` before approval; findings folded in (null `level`, column checks, `daysLeft` for chosen weekdays, `last` filter, `e2e/helpers.ts`, task 1 not shippable alone).
