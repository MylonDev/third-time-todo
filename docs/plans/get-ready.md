# Plan: Epic 3 of 8 — Get ready checklist, kata `0hjn` (issue `4e6w`)

## Context

Spec: `docs/specs/2026-10-18-product-concept.md`, "Get ready". The user keeps a short checklist (desk, water,
food, air, vitamins) that is offered before the day's first session and can always be skipped. Steps are
edited in Settings and are empty by default. Prior art is `PreflightModal` on `claude/brainstorm-features`
(read-only worktree; reuse the layout idea, never touch it). It keeps no record and has no sync.

Out of scope: **h7qq** (a get-ready item makes a Low day non-zero) moves with epic 5; anything that reads the
completions (History, f00r); seeding steps from onboarding (epic 8); reordering steps; the tab-shell rework
(epic 6); the open follow-ups from epics 1 and 2.

## Decisions (the four open questions)

1. **Storage and sync.** Two parts:
   - The **step list** lives in `user_settings` as a jsonb column `get_ready_steps` (`[{id, text}]`). Edits are
     rare and the list is short, so whole-list last-writer-wins with the other settings is enough. No new table.
   - The **per-day record** is one new synced table `get_ready_days`, keyed by the day key (`id` = `2026-10-12`),
     with `done` (step ids ticked), `skipped`, `updated_at`, `deleted_at`. It fits `mergeById`/`stampChanged`
     unchanged because it has `id` and `updatedAt`.
2. **Completions are recorded now**, per day, as above. A day row's existence also means "already offered
   today", so there is no separate flag. Ids (not text) are stored so a rename keeps history; a step deleted
   later leaves its id in old rows, which is harmless.
3. **First session of the day.** The offer fires on pressing Start (Flow Focus/Rest tile, or Timed Start) when
   stopped and all of these hold: there is at least one step, there is no `get_ready_days` row for today's day
   key, and no live (non-deleted) ledger entry that *begins a stretch* inside today's window. An entry begins a stretch
   when no live entry has `endedAt === its startedAt` (the walk-back `balanceWindow` does in `utils/ledger.ts`
   :84-97). Without that rule, a Focus carried past midnight and switched to Rest at 00:30 would hide the offer,
   as would Fix timer during a carried session. The test also covers steps added mid-day and a session begun on
   another device. A session carried past the day end is not a new
   start, so it triggers nothing; once it is stopped, the next start is in the new day and gets the offer.
   Switching Focus↔Rest while running never offers (stopped only).
4. **Placement.** A modal (`Modal`, size `sm`) that interrupts Start. It is independent of the tab shell, so
   epic 6 does not disturb it.

Behaviour of the modal: lists the steps as checkboxes. "Skip" records `{done: [], skipped: true}` and starts.
"Start" records the ticked ids with `skipped: false` and starts (works with nothing ticked). Escape or the scrim
backs out: nothing starts and nothing is recorded, so it is offered again. Skip is never blocked.

## Repo facts for the executor

- Checks (all six run in CI): `npm run format:check`, `npm run lint`, `npm run knip`, `npm run build`,
  `npm run test:unit`, `npm test` (Playwright, fake clock; `advance`, `MIN`, `startState` in `e2e/helpers.ts`;
  clock starts Monday 12 Oct 2026, 10:00). Run all six before the commit; run tests via `rtk proxy` when a test
  file is new.
- Repo rules: no Claude co-author trailer and no PR footer; never `--no-verify`; no bare `git stash`; do not push
  and do not apply the migration (the main session asks the user first).
- Worktree: `.claude/worktrees/epic-get-ready` on branch `epic/get-ready` from `origin/main` (created by the main
  session after approval; run `npm ci` there).

## Task (one Sonnet implementer, effort high, one commit for kata `4e6w`)

Implementer: `feature-lite:implementer`. Coupled work in shared files, so one agent and one commit.

1. **Types and pure logic** — `src/types.ts`: `GetReadyStep {id, text}`, `GetReadyDay {id, done: string[],
   skipped: boolean, updatedAt}` (no `deletedAt`, no `createdAt`: nothing deletes a day). New `src/utils/getReady.ts`:
   - `shouldOfferGetReady(steps, days, entries, today, dayEndHour)` per decision 3 (reuse `dayKeyOf`/`windowOf`
     from `utils/time.ts`);
   - `recordGetReady(days, today, done, skipped, now)` returning the new array (upsert by day key);
   - step helpers: make a step with `crypto.randomUUID()` (as `makePractice` does), rename, and remove by filtering
    the list (no tombstones; the list is one jsonb value).
2. **Stores** — `src/store/settings.ts`: `getReadySteps: GetReadyStep[]` (default `[]`), `setGetReadySteps`
   bumping `updatedAt` like the others, but a no-op when the list is unchanged (a stale device must not bump it
   and wipe another device's list); persist version 4→5 with the migrate defaulting `[]`. New
   `src/store/getReady.ts` (`tt2-getready`, version 1, `days`, `record`) modelled on `store/practices.ts`
   with `stampChanged`. Add `tt2-getready` to `src/store/crossTab.ts`.
3. **Sync plumbing** — modelled on the practices change:
   - `src/sync/rows.ts`: `GetReadyDayRow` (`id, done text[], skipped, updated_at, deleted_at`) and its two
     mappers; `SyncedSettings` gains `getReadySteps`; `SettingsRow.get_ready_steps` optional (older rows → `[]`).
   - `src/sync/engine.ts`: `getReadyDays` in `Snapshot`, `Cursors` (both `pushed` and `pulled`), `FRESH_CURSORS`,
     `Remote`, `Incoming`, `pushDirty`, `pullAll`, the dirty check in `syncOnce`, `mergeIncoming`.
   - `src/sync/remote.ts`: `pushGetReadyDays`/`pullGetReadyDays` on table `get_ready_days`.
   - `src/sync/runtime.ts`: `local.read/apply`, the realtime channel and the store subscription.
   - `src/sync/status.ts`: `tt2-sync` version 3 and a migrate step that starts the new cursor from zero/null
     (extend `migrateSyncMeta`; chain the steps: v1→v2 then v2→v3; today's early return at `version >= 2` must go).
   - Migration `supabase/migrations/20261019170000_get_ready.sql`, copying the shape of
     `20261019150000_practices.sql`: table `get_ready_days` (user_id, id text, `done text[] not null default
     '{}'`, `skipped boolean not null default false`, `updated_at bigint not null`, `deleted_at bigint` (kept for
     schema uniformity, never written), NO `created_at` column, `server_updated_at`, pk
     `(user_id, id)`, cursor index, `keep_newest` trigger, RLS "own rows", revoke from anon, realtime
     publication) plus `alter table public.user_settings add column get_ready_steps jsonb not null default
     '[]'`.
4. **UI** —
   - `src/components/SettingsModal.tsx` (or a small `GetReadySettings.tsx` it renders): a "Get ready" section,
     one text input per step with remove, plus an add field; helper text "Offered before the day's first
     session. Always skippable." Commit edits on blur/Enter, and also commit any pending draft on unmount (an effect cleanup):
     Escape or a scrim click closes the Modal without a blur, and iOS buttons may not blur. Blank steps are dropped.
   - New `src/components/GetReadyModal.tsx` (layout from `PreflightModal`: checkbox rows with `min-h-12`, grid of
     two buttons, Skip then Start; use the project's tokens, `bg-accent text-on-accent`, light and dark safe).
   - `src/components/TimerPanel.tsx`: hold `pending: (() => void) | null`. A `begin(fn)` wrapper (the day key recorded is computed from `Date.now()` and `dayEndHour` when Start/Skip is
  pressed, not the render-time `today`): if
     `!running` and `shouldOfferGetReady(...)` then `setPending(() => fn)`, else `fn()`. Route both the Flow tile
     `start(s, practiceId)` and the Timed `startTimed(ms, practiceId)` through it. The modal's Start/Skip record
     then call the pending function. Capture the practice id at press time (the closure does).
5. **Tests**
   - vitest (`src/utils/getReady.test.ts`): offered with steps and a clean day; not offered with no steps; not
     after a row exists (done or skipped); not when an entry started today; offered when the only entry is
     yesterday's, including one that ended after the day-end hour with `dayEndHour` 3; the carried case (Focus from 23:00,
     Rest from 00:30, stopped 01:00, next start 09:00 IS offered);  deleted entries ignored;
     `recordGetReady` upserts and keeps other days. Rows round-trip (`rows.test.ts`), engine sync of
     `getReadyDays` and `getReadySteps` between two devices (`engine.test.ts`; update its fixtures and the
     `cursors.pushed` expectation), `migrateSyncMeta` v2→v3.
     Existing tests that must be updated, not deleted: `src/sync/status.test.ts` (v1 and v2 cases, the `toBe`
     early-return one); in `src/sync/engine.test.ts` the `FakeServer implements Remote` class (add get-ready
     push/pull), the Device `state` and settings literals (~lines 80-84, 298, 300: add `getReadySteps: []`) and
     the `cursors.pushed` expectation (~397).
   - e2e (`e2e/getReady.spec.ts`, new): no steps → Start runs at once; add two steps in Settings → Start shows
     the modal, tick one, Start → timer runs, ticking persisted; stop and start again → no modal; advance to the
     next day (after midnight) → offered again; Skip starts and is not re-offered that day; Timed start is
     offered too; Escape starts nothing. In `e2e/sync.spec.ts` (the mock is generic, no change) add: a get-ready day is sent to
     `get_ready_days`; steps are sent in the settings upsert as `get_ready_steps`; steps served by another
     device show in Settings. These catch a typo in the table or column name.
   - Verify: all six checks green.
6. **Kata**: `kata claim 4e6w` before; after the commit `kata close 4e6w --done --test "<checks>" --commit <sha>
   --message "<what, how verified>"` (use `--project third-time-todo --agent` if run outside the repo).

## Main session after the implementer (not delegated)

1. Read the full diff with `git -C`, re-run the six checks.
2. Preview the worktree at phone width (390 px), light and dark: empty Settings section, add steps, the modal,
   Skip, a second Start the same day.
3. Run `feature-lite:reviewer` once on the diff; triage.
4. **Ask the user** before applying the `get_ready` migration to project `adsovripnuawbofptgml`. It must be applied
   BEFORE the PR merges or auto-merge is enabled: the new build pushes `get_ready_steps` and `get_ready_days`,
   and `syncOnce` pushes before it pulls, so a missing column/table fails every sync.
5. Ask before pushing; open the PR `epic/get-ready` → `main` with auto-merge (required check "check") only after
   the migration is live; no attribution footer. Close `0hjn` after review. Wait for the merge before planning epic 4.
6. Follow-up notes to kata in one batch: h7qq now has data to read (`get_ready_days`); reordering steps if wanted;
   `debt`: steps share the settings' single `updatedAt` (a stale device that changes another setting can wipe
   the list); `debt`: two devices recording the same day keep only the later row (`done` not unioned), which
   h7qq/f00r should know.

## Verification

- Six checks pass locally and in CI.
- Manual: with steps set, the first Start of the day shows the modal; the second does not; the next day it does
  again; empty steps never show it; two browser contexts signed in see the same steps and the day record (after
  the migration is applied).
