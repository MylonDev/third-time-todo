# Two-state rebuild: Should earns Want

**Status:** decisions settled; Phases 0 and 1 in progress.

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

interface Item {                 // a checklist line, no timer attached
  id: string;
  text: string;
  kind: 'should' | 'want';
  dueOn: string | null;          // day key; null = Later ("someday")
  done: boolean;
  doneAt?: number;
  repeat?: Recurrence;           // daily | weekdays | weekly | every N days
  nextId?: string;               // the occurrence a completion spawned
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
- **Day boundary.** Entries are never split. A day's totals clip each entry to
  that day's window, so an entry that crosses the boundary counts toward both
  days and the running timer simply continues. The balance (credit or debt)
  starts at 0 each day.
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
3. **Today** and **Later**, switched by a segmented control. Each shows a
   **Should** and a **Want** section of plain checklist lines: add, check off,
   edit, move. Which view an item is in follows from `dueOn`:
   - **Today** shows every unchecked item due today **or earlier**. Anything
     overdue sits in Today, marked with how late it is, and stays until done
     or moved. Items checked off today stay visible, struck through.
   - **Later** shows items due after today, grouped by date, then items with no
     date ("Someday").
   - A new item added in Today is due today. One added in Later has no date.
   - Setting a date (Today, Tomorrow, a picked day, Someday) is how an item
     moves between the views.
4. **Daily target progress**, shown only if a target is set.

**Days** is a simple history list: per day, Should time, Want time, ending
balance, and whether the target was hit. Tapping a day opens its entries for
editing with the same correction tools.

**Settings:** day end hour, daily target, sounds, theme, account.

There is no tab shell, week view, pace chart or timeline rail.

## Recurring items

Both Should and Want items can repeat: daily, chosen weekdays, weekly, or every
N days.

- A repeating item is an ordinary item with a `repeat` rule. **Checking it off
  creates the next occurrence**, due on the first matching day after the later
  of its due date and today. Missing several days therefore leaves one overdue
  item, not a pile.
- The next occurrence has a deterministic id (`seriesId:dueOn`), so two devices
  completing the same item create one occurrence, not two. The completed item
  records it in `nextId`.
- Unchecking an item removes the occurrence it spawned, if that is untouched.
- Deleting a repeating item stops the series. A dialog offers "this one only"
  versus "this and future ones".
- Weekly repeats on the weekday of the item's current due date. Every-N counts
  from the later of the due date and today.

## Correcting the timer

One control on the running timer, **Fix timer**, covers every case with one
question and two answers:

1. **How long?** Chips for 5, 10, 15 and 30 minutes plus a custom value.
2. **Those minutes were:** Should, Want, or Rest.
3. **Since then I've been:** Should, Want, or Stopped. This defaults to the
   current state.

| You were | Those minutes were | Since then | Result |
| --- | --- | --- | --- |
| Running Should, did Want for 20 min and are still on it | Want | Want | Should up to now-20, Want runs from there |
| Running Should, did Want for 20 min and are back | Want | Should | A 20 min Want entry, Should resumes now |
| Forgot to stop 20 min ago | Rest | Stopped | The last 20 min are removed, timer off |

A one-line preview ("Want from 2:14 to 2:34, then Should") is shown before
applying. Underneath it is a single ledger operation, **paint(from, to,
state | rest)**, which overwrites a range of time. Entries inside the range are
tombstoned, entries straddling it are trimmed, and adjacent entries of the same
state merge. The same operation will power editing in the Days view.

If the range reaches back over earlier entries it overwrites them, so a Fix can
also repair a state switch you made late. A range longer than 12 hours is
refused.



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
  releases. The target device runs iOS 27.2 (developer build), which is newer
  than anything I can check behaviour for, so **the only real test is on the
  phone**. If acquiring the lock fails, fall back to a normal timer with no
  alarming error.

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

## Decisions

1. **Overdue** items show in Today until done or moved.
2. **Both lists** can hold recurring items, and Want items can be checked off.
3. **Fresh start.** No import. Old `tt-*` localStorage keys are left untouched
   and ignored; the new app uses `tt2-*` keys.
4. **Device:** iOS 27.2 developer build.
