# Two-state rebuild: Should earns Want

**Status:** plan, nothing built yet.

The app stops being a work/break timer with a todo list attached. It becomes a
balance between two kinds of time you spend on purpose: things you **should**
do and things you **want** to do. Should time earns Want time. When the app is
not running you are resting, and the app has no opinion about it.

## Principles

- **Awareness, not enforcement.** The app tells you the truth. It never locks,
  blocks or nags beyond an optional alert.
- **Running means balancing.** Stopped means resting: free, untracked, and
  nothing to feel guilty about. Finishing your Should work and stopping the
  timer is the intended way to be done for the day.
- **One ratio.** 1:3 (the old "Serious"). Every 3 seconds in Should earns 1
  second of Want. Every second in Want spends 1 second. No modes, no
  multipliers, no per-task time.
- **Time is derived, never counted.** The timer is a start timestamp. Nothing
  ticks into storage, so a suspended or killed app loses nothing.
- **Debt is allowed.** The balance can go negative within a day.

## Model

```ts
type TimerState = 'should' | 'want';

interface TimeEntry {            // append-only ledger
  id: string;                    // client-generated uuid
  state: TimerState;
  startedAt: number;             // ms epoch
  endedAt: number | null;        // null = the one running entry
  updatedAt: number;             // last-writer-wins on sync
  deletedAt?: number;            // tombstone, so deletes sync
}

type ListKind = 'should' | 'want' | 'later';

interface Item {                 // a checklist line, no timer attached
  id: string;
  text: string;
  list: ListKind;
  done: boolean;
  order: number;
  updatedAt: number;
  deletedAt?: number;
}

interface Settings {
  dayEndHour: number;            // 0 = midnight, up to 4
  shouldTargetMin: number | null;
  soundsEnabled: boolean;
  theme: 'system' | 'light' | 'dark';
}
```

- **Balance for a day** = `shouldMs / 3 - wantMs`, over entries inside that
  day's window, including the running entry measured to `now`. Derived on read.
- **Day boundary.** Entries are split at the day end, as `splitAtBoundary` does
  today. The balance (credit or debt) starts at 0 each day. The running timer
  continues across the boundary as a new entry.
- **Daily target.** Optional. Progress is `shouldMs / target`. Reaching it shows
  a quiet "done for today, you can stop" state. Nothing happens if you ignore it.
- **One running entry.** There is at most one entry with `endedAt = null`.
  Switching state closes it and opens the next in one atomic operation.

## Screens

**Today** is the whole app.

1. **Timer header.** Large elapsed time for the current stint, the state toggle
   (Should / Want), Stop, and the day balance. The balance reads as "Want
   available" when positive and "Want debt" when negative.
2. **Correct** control on the running timer (below).
3. **Should**, **Want** and **Later** lists. Items are plain checklist lines:
   add, check off, edit, reorder, move between lists. Later holds anything that
   does not belong to this day, and you pull an item into Today when it does.
   Unchecked Today items stay on Today at the day boundary, marked as carried.
4. **Daily target progress**, shown only if a target is set.

**Days** is a simple history list: per day, Should time, Want time, ending
balance, and whether the target was hit. Tapping a day opens its entries for
editing with the same correction tools.

**Settings:** day end hour, daily target, sounds, theme, account.

There is no tab shell, week view, pace chart or timeline rail.

## Correcting the timer

One control on the running timer, **Switch X ago**, with chips for 5, 10, 15
and 30 minutes plus a custom value. It moves the boundary between the previous
stretch and the current one:

| You were | Action | Result |
| --- | --- | --- |
| Running Should, but did Want for the last X | Switch to Want, X ago | Should is closed at now - X, Want opens there |
| Running Want, but did Should for the last X | Switch to Should, X ago | the mirror |
| Forgot to stop | Stop, X ago | the entry ends at now - X, the rest is rest |

If X reaches back past the start of the current entry, it also shortens the
entry before it, and an X larger than the whole of the day's history is refused.
These are ordinary ledger edits: they change `startedAt` and `endedAt` and bump
`updatedAt`. The same edit is available on any entry in the Days view.

## What stays from the current code

Keep, adapt and move to a fresh `src/`:

- `utils/thirdTime.ts`: the ratio math, reduced to the one ratio.
- `utils/ledger.ts`: bank derivation, boundary splitting, overlap checks.
- Day-boundary logic and the `dayEndHour` setting.
- `sounds.ts`, `notifications.ts`, the theme setup and the PWA assets.
- The vitest and Playwright setup, and the CI workflow.

Delete: projects, goals, habits, the week schedule and recurrence, pace band and
chart, difficulty modes and quota, the day timeline and entry editor, the tab
shell, and the old stores. Remove `@dnd-kit` and `framer-motion` afterwards if
nothing in the new UI uses them. Existing `localStorage` data is **not**
migrated. This is a fresh start, and a one-off import of the old ledger is an
optional extra if wanted.

## Platform requirements

These three were named as important.

### Wake lock
- Use the Screen Wake Lock API while a timer is running, behind a setting.
- The lock is released whenever the page is hidden, so re-acquire it on
  `visibilitychange`.
- Wake lock inside an installed iOS home-screen app has had bugs in some
  releases. **Verify on the actual phone and iOS version before relying on it.**
  If it fails, show nothing alarming and fall back to a normal timer.

### Background tracking
- The running entry is persisted the moment it starts, locally and to the
  server. The display is computed from `startedAt`, so a suspended, throttled or
  killed page recovers exactly on resume.
- On `visibilitychange`, `pageshow` and `online`, the app recomputes, pulls
  remote changes and flushes its queue.
- JavaScript does not run while an iOS web app is backgrounded. That is fine for
  correctness. It matters only for alerts, which need web push (optional,
  later). Live Activities and Dynamic Island are not available to web apps.
- Set the app icon badge (Badging API) to the balance in minutes whenever the
  app is open, so the icon carries a last-known value.

### Reliable sync
- **Local first.** Every action writes to local storage first, then to a queue.
  The app never waits on the network.
- **Idempotent writes.** Client-generated uuids and upserts, so replaying the
  queue is safe.
- **Per-row last-writer-wins** on `updatedAt`, with soft deletes.
- **Timer transitions are server-side.** A Postgres function `transition(state,
  at)` closes the open entry and opens the next in one transaction, so two
  devices can never leave two open entries. An offline queue replays
  transitions in timestamp order.
- **Overlap repair.** If two devices disagree, entries are resolved to a
  non-overlapping timeline by truncating the earlier entry. This is the
  riskiest piece and gets the heaviest tests.
- **Live updates.** Supabase Realtime pushes changes to the other device while
  it is open. Pull-on-resume covers everything else.
- **Timestamps.** Entries use device clocks, so a large skew between devices
  would distort times. The server stamps `updatedAt` for ordering, and a
  warning appears if the device clock is more than a minute off.

## Hosting and auth

- The frontend stays on **GitHub Pages**. `vite.config.ts` sets
  `base: '/third-time-todo/'`, while `manifest.webmanifest` has `start_url` and
  `scope` of `/`. **Verify the install and start URL on a phone and fix the
  manifest if needed.**
- **Supabase** provides Postgres, auth and realtime, with **row-level security**
  so a login can only read and write its own rows. The anon key is public by
  design and safe to ship, and the service key never goes in the client.
- **Login is an emailed one-time code**, not a magic link. On iOS an installed
  app does not share storage with Safari, so a magic link would sign in Safari
  and leave the app signed out. A passkey option can follow if Supabase supports
  it by then.
- Sign in once per device. The session persists.

### Needed from you when we reach Phase 3
1. Create a Supabase project (free tier is enough).
2. Give me the project URL and the anon key. Both are safe to put in the repo.
3. Add `https://mylondev.github.io/third-time-todo/` and
   `http://localhost:5173` to the project's allowed redirect URLs.
4. Tell me which email you will sign in with.

I will write the schema and policies as SQL migrations in the repo for you to
run in the Supabase SQL editor.

## Build order

Each phase ends with lint, build, unit and e2e tests green, and stands alone.

**Phase 0: Clear the ground.** New branch from main. Delete the scoped-out
code. Carry over the kept utilities with their tests. Target ratio is fixed at 3.

**Phase 1: Local core.** Types and the ledger store. The timer state machine,
including transition, stop and boundary split. Balance and target derivation.
Today screen with the three lists. Correction control. Mobile-first layout with
safe-area insets. Unit tests for balance, boundary and correction edge cases;
e2e for the main flows.

**Phase 2: iOS-grade PWA.** Wake lock with re-acquire. Resume and recompute
handling. Icon badge. Manifest and install fixes. Install guidance. A manual
device test checklist, since none of this can be tested headless.

**Phase 3: Supabase and sync.** Needs your setup, listed above. Schema, RLS
and the `transition` function. Email-code login. Outbox and replay, realtime,
overlap repair. Tests that run two simulated devices through offline edits and
conflicting timers.

**Phase 4: Days view and polish.** History list and entry editing. Settings.
Empty and error states. Optional web push for "balance is in debt" and "target
reached", only if awareness alone proves not to be enough.

## Open questions

1. **Carried items.** The plan keeps unchecked Today items on Today at the day
   boundary. The alternative is moving them to Later. Say if you prefer that.
2. **Want items.** The plan lets Want items be checked off like any other. If
   wants should be reusable ("guitar" every day), they would need to reset
   daily, which adds recurrence. Left out for now.
3. **Old data.** Fresh start, or a one-off import of the existing ledger?
