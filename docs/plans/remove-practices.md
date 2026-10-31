# Remove Practices and Get ready

**Goal:** Take the app back to its core (the Focus/Rest timer and bank, Flow and Timed, Today and Later, sync) by removing Practices and Get ready from the code, the live database and kata.

**Decisions:**
- Get ready goes too, including its Settings section. (user)
- Live data is dropped now, with no export: `practices`, `get_ready_days` and their columns. Hours stay on the entries; only the practice label on them goes. (user)
- Kata: close the items only about these features, and rewrite the mixed ones. (user)
- Going with them, because they exist only for practices: weekly cap, Needs attention, next-step notes, the "For" select.
- **Default (unanswered):** the local copies on each device (`tt2-practices`, `tt2-getready`) are removed on startup, so nothing is left behind.
- **Default (unanswered):** `docs/plans/*` and `design/` stay as history. The product concept spec is edited, because it describes the direction.
- **Default (unanswered):** branch and PR with auto-merge, as recent work did, not a direct push to `main`.
- **Default (unanswered):** the Timed length always starts at 20 minutes, so the `initialMinutes` prop goes.

**Design:**
- **Order is the main risk.** The live build reads and writes these tables and columns, so dropping them first breaks sync for every client. The order is: merge, confirm Pages serves the new build, then apply the migration. A tab or installed app still on the old build shows a sync error until it reloads. Nothing is lost, because its cursors move only after a push is accepted.
- **Settings return to one version.** `user_settings` goes back to the `keep_newest` trigger, and `mergeSettings` compares `updatedAt` only. A tie with different content still goes to the incoming row, matching the trigger.
- **Local migrations** (changed after review, see Process notes):
  - `tt2-sync` v6: drop the `practices` and `getReadyDays` cursors and reset `pushed.settings` to 0. The reset covers a cursor left above new edits by the old steps version; a stale push is dropped by `keep_newest` and the pull takes the newer row. This replaces the whole chain in `migrateSyncMeta`.
  - `tt2-settings` and `tt2-ledger` keep their versions. Old fields (`practiceId`, `getReadySteps` and so on) stay inert in existing blobs until a later bump, because bumping either store is unsafe with an old-build window open.

**Migration** (`supabase/migrations/20261031120000_remove_practices.sql`):

```sql
-- The merge function reads the columns dropped below, so it goes first.
drop trigger user_settings_merge on public.user_settings;
create trigger keep_newest before insert or update on public.user_settings
  for each row execute function public.keep_newest();
drop function public.user_settings_merge();

drop table public.practices;
drop table public.get_ready_days;
drop function public.practice_level_targets();

alter table public.user_settings
  drop column weekly_cap_min,
  drop column get_ready_steps,
  drop column get_ready_steps_updated_at;
alter table public.time_entries drop column practice_id;
```

## Tasks

- [ ] **1. Open a kata issue and a branch** (me)
  - Create one tracking issue for this removal, claim it, and branch `chore/remove-practices`.
  - Acceptance: issue claimed, branch checked out.
  - Verify: `kata show <ref> --agent`

- [ ] **2. Remove both features from the client** (sonnet, one agent: changing `types.ts` breaks everything until the sweep is done)
  - Delete: `src/store/{practices,getReady}.ts`, `src/utils/{practices,getReady}.ts`, `src/components/{PracticesView,PracticeEditor,GetReadyModal,GetReadySettings,NeedsAttention,CapModal,NextStepModal}.tsx`, `src/hooks/useNextStepPrompt.ts`, `e2e/{practices,getReady}.spec.ts`, and their unit tests.
  - Edit: `src/App.tsx` (two tabs), `TimerPanel.tsx`, `TimedStart.tsx`, `SettingsModal.tsx`, `types.ts`, `store/{settings,timer,crossTab}.ts`, `utils/ledger.ts`, `sync/{engine,rows,remote,runtime,status}.ts`, `main.tsx`, and the helpers and tests they touch (`e2e/helpers.ts`, `e2e/sync.spec.ts`, `engine.test.ts`, `rows.test.ts`, `status.test.ts`, `settings.test.ts`, `ledger.test.ts`).
  - Acceptance: no practice or Get ready code remains outside the old migrations and history; the `tt2-sync` migration above exists with tests; `normalize` no longer compares practices; timer, debt, Fix timer and Timed behave as before.
  - Verify: `npm run build && npm run lint && npm run knip && rtk proxy npm run test:unit && rtk proxy npx playwright test`, plus `rtk proxy grep -rniE "practice|get.?ready|weeklyCap" src e2e`, which must return nothing but the migration code that strips the old fields.

- [ ] **3. Write the migration and update the docs** (me), after 2
  - Files: the migration above, `docs/specs/2026-10-18-product-concept.md`.
  - Spec: remove the Practices, Get ready and First-run check sections and the Return card paragraph. The effort-level goals are defined by practices, so mark them as needing redefinition rather than inventing new ones.
  - Acceptance: the migration file matches this plan. It is not applied yet.
  - Verify: read the live schema (`list_tables`, `list_migrations`, read-only) and confirm it matches what the SQL expects.

- [ ] **4. Review, then PR with auto-merge** (reviewer agent, then me), after 3
  - Run `feature-lite:reviewer` on the full diff, triage the findings, push, and open the PR with auto-merge.
  - Acceptance: CI green, merged, and the Pages deploy finished.
  - Verify: the live bundle has no Practices tab and no `get_ready_days` reference (Playwright on the live URL, or fetching the bundle).

- [ ] **5. Apply the migration to live Supabase** (me), after 4, **only after asking you once more**
  - This is the permanent step. I stop and confirm right before it, with the deploy confirmed.
  - Acceptance: the tables and columns are gone, and the `keep_newest` trigger is on `user_settings`.
  - Verify: `list_tables`, and a settings write and timer entry syncing from the live app with no sync error.

- [ ] **6. Tidy kata** (me), after 5
  - In one batch:
    - Close as wontfix: `3g8h`, `nmt5`, `8pe8`, `86dq`, `9xes`, `vr9r`, `hazq`, `h7qq`, `0m5y`.
    - Rewrite: `mbgt` (the review sheet offers Today repeat or drop only) and `hmw3` (no practice lines).
    - Close the tracking issue with the commit and verify command.
  - Acceptance: `kata search practice --agent` and `kata search "get ready" --agent` show no open item that still depends on these features, except comments on `8f0p`-area items noted in the report.
  - Verify: those two searches.

## To flag in the report, not act on

- `8f0p` (Daily check) is left with only `zcmj`, and the suggestions it fed are gone, so its purpose needs a fresh look.
- The `tt2-sync` v6 step and the `removeItem` loop in `src/main.tsx` can go once all devices have updated.
- Inert fields stay in existing `tt2-settings` and `tt2-ledger` blobs. Strip them at the next version bump of those stores.

## Process notes

- Reviewer, not user: the planned `tt2-settings` v7 and `tt2-ledger` v2 bumps were dropped. With an old-build window open they caused a write loop that starves sync, and could overwrite newer entries; the `updatedAt` lift could also beat newer edits.
