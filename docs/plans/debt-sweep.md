# Clear the open debt

**Goal:** Close the debt issues worth fixing now (vmzh, 4djy, kdb8, ts9j, egzh, r23n) in one branch and one PR, and leave two (3g8h, nmt5) open with a reason. Sync and storage are touched, so one migration is pasted by the user. The plan was reviewed once; its findings are folded in below.

**Decisions:**

- **One branch `chore/debt-sweep`, one PR, no epic.** Worktree `.claude/worktrees/debt-sweep` from origin/main. Each issue is claimed and closed with its own verify. **Default (unanswered).**
- **vmzh: rewrite the host only.** `registry.npmmirror.com` → `registry.npmjs.org` in the 61 `resolved` URLs; integrity hashes untouched (same tarballs, same paths). Verify against the real registry: `npm ci --cache "$(mktemp -d)"` in a scratch clone, plus a HEAD request to each of the 61 rewritten URLs (expect 200), since 38 are platform bindings Linux never fetches. CI uses plain `npm ci`; there is no Dependabot config in the repo. **Default (unanswered).**
- **ts9j: union the days.** Same day id on two devices merges to `done` = union (compared as sets, stored sorted), `skipped` = true only if both skipped. Branches, so equal pairs are left alone and devices converge: if the union equals remote's content and local equals it too, return `mine`; if it equals remote only, return remote; if it equals local's content and local is newer, return `mine`; otherwise a new row stamped `max(local, remote, now) + 1`. The `now` term matters: `pushDirty` sends only rows above the pushed cursor, so a union stamped just above an old row would never be sent. `mergeIncoming` takes `now`. **Default (unanswered).**
- **egzh: the steps get their own version, and the server merges field by field.** Steps edits bump only `getReadyStepsUpdatedAt`; scalar edits (day end, target, cap) bump only `updatedAt`. Dirty checks and the pushed cursor use `max` of the two. The `user_settings` `keep_newest` trigger is replaced by one field-wise trigger that never returns null. Alternative, a `get_ready_steps` table with a row per step (also solves 8pe8), is bigger and better done with 8pe8. **Default (unanswered).**
- **Old builds can no longer change the steps.** An old build never sends the new version column, so its stale steps could slip through. The trigger keeps the stored steps whenever the incoming steps differ and the incoming version is not newer. Cost: a cached old build's steps edits are ignored until it updates. Acceptable: steps edits are rare, and Get ready is new.
- **r23n: do it, and reset the weekdays too.** The trigger derives `target_days`/`target_min` from `level` and sets `target_weekdays = '{}'` when an old build inserts with targets all zero and level not paused, or updates with a changed `level`. A new client never sends `level`, so it never trips it.
- **nmt5: leave open.** Its own text says "if another writer appears". A check a future writer violates would fail a whole 500-row batch and block sync.
- **3g8h: leave open.** A reload prompt guards only the next version bump; it cannot stop an old-build tab overwriting v2 now.
- **Settings store v6 starts the steps version at 0**, not `updatedAt`, so a stale device cannot stamp its stale steps as new; the server's version wins on first sync. Gated on `version < 6`. **Default (unanswered).**
- **Migration order:** the user pastes the SQL; I verify with the anon key (401 on real columns, 400 on missing) before merging, and the new client is not deployed until then. I ask before any push or merge.

**Design:**

- `mergeById(local, remote, resolve?)` in `src/sync/merge.ts`; `mergeDays` in `src/utils/getReady.ts` (pure) is the resolver for `getReadyDays`. `resolve` returns `mine` itself when nothing changes so refetches wake no store.
- `SyncedSettings` gains `getReadyStepsUpdatedAt`; `rows.ts` maps `get_ready_steps_updated_at` (missing → 0). `mergeSettings(current, incoming)` replaces the whole-object compare in `mergeIncoming`: scalars from the side with the larger `updatedAt`, steps from the side with the larger steps version; on an equal version with different steps, the canonical-JSON compare decides (as `pick` does). Returns `current` itself when unchanged.
- `src/sync/engine.ts`: `settingsDirty` and the pushed-settings cursor use `max(updatedAt, getReadyStepsUpdatedAt)`; the dirty check in `syncOnce` likewise.
- `src/sync/status.ts` v5 resets `pulled.settings` to null.
- Migration `supabase/migrations/20261020120000_debt_sweep.sql`, in this order: add `get_ready_steps_updated_at bigint not null default 0`; backfill it to `updated_at` where steps are non-empty (fires `keep_newest`, which moves `server_updated_at`, as wanted); drop `keep_newest` on `user_settings` and add `user_settings_merge` (before insert or update): on insert stamp `server_updated_at` only; on update (checks `tg_op = 'UPDATE'` before touching OLD) keep OLD's scalars and `updated_at` when `new.updated_at < old.updated_at`, keep OLD's steps and steps version when `new.get_ready_steps is distinct from old.get_ready_steps and new.get_ready_steps_updated_at <= old.get_ready_steps_updated_at`, stamp `server_updated_at`, return new. Then the practices trigger. Both functions `set search_path = ''`.
- kdb8: the test matches per assignment (`target_days = case … end`, `target_min = case … end`) in `20261019190000_practice_targets.sql` and the new migration, collects every `when '<level>' then <n>` inside each, and compares with `targetOf` from `TEMPLATES`.
- 4djy: `Chip` in a new `src/components/Chip.tsx`, used by `PracticeEditor` and the length chips in `TimedStart`.

## Tasks

- [ ] **1. Lockfile host (vmzh)** (me)
  - Files: `package-lock.json`
  - Acceptance: no `npmmirror` left; `npm ci` works in a fresh clone with an empty cache and no copied `node_modules`; all 61 URLs return 200.
  - Verify: `grep -c npmmirror package-lock.json` prints 0; `npm ci --cache "$(mktemp -d)"` in a scratch clone exits 0; a `curl -sI` loop over the 61 URLs.
- [ ] **2. Migration SQL (egzh, r23n)** (me)
  - Files: `supabase/migrations/20261020120000_debt_sweep.sql`, `scripts/` throwaway test harness (not committed)
  - Acceptance: all migrations apply in a Postgres container with stubs for `auth.users`, `auth.uid()` and the `supabase_realtime` publication, and these cases pass: old-build upsert omitting the version column; stale scalars with fresh steps; fresh scalars with stale steps; first insert; old-build practice insert; old-build level change; new-client update on a row whose level is still `steady`.
  - Verify: `docker run` a postgres image, apply the files in order, run the cases with `psql`.
- [ ] **3. Client changes (ts9j, egzh, 4djy, kdb8)** (sonnet), after 2
  - Files: `src/utils/getReady.ts` (+ test), `src/sync/merge.ts`, `engine.ts`, `rows.ts`, `runtime.ts`, `status.ts`, `src/store/settings.ts`, `src/components/Chip.tsx`, `PracticeEditor.tsx`, `TimedStart.tsx`, tests for each sync file, a migration-vs-templates test.
  - Acceptance: each `mergeDays` branch has a test, including the pushed-cursor case; steps-only edits bump only the steps version and are pushed; a stale scalar edit never changes the steps on a client merge; kdb8 parses both migrations; one Chip class string.
  - Verify: `npm run test:unit`, then all six checks.
- [ ] **4. Review, then PR** (me)
  - Acceptance: reviewer run once on the full diff, findings triaged; six checks green; `rtk proxy npm test` run alone; issues closed with their own verify; 3g8h and nmt5 get a comment saying why they stay.
  - Verify: `npm run format:check && npm run lint && npm run knip && npm run build && npm run test:unit`, then `rtk proxy npm test`.

## Process notes

-
