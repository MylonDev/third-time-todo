# Third Time

A time balance for the things you **should** do and the things you **want** to
do. Time spent on Should earns Want time at 1:3, so every hour of Should earns
20 minutes of Want. Want time spends it back, second for second. The balance can
go negative (debt) and resets when the day ends.

The idea comes from [Third Time](https://www.lesswrong.com/posts/RWu8eZqbwgB9zaerh/third-time-a-better-way-to-work),
a break system where rest is earned as a fraction of work. Here the "rest" is
time you spend on something you chose, rather than vegging out or scrolling.

Live at **https://mylondev.github.io/third-time-todo/**

> This is a ground-up rebuild. The design and the plan are in
> [`docs/specs/2026-10-09-two-state-rebuild.md`](docs/specs/2026-10-09-two-state-rebuild.md).
> Older specs in `docs/specs/` describe the previous work/break design and are
> kept for history.

## How it works

- **Running means balancing.** Pick **Should** or **Want**. Stop the timer and
  you are resting: free, untracked, nothing to feel bad about.
- **Awareness, not enforcement.** The app tells you where you stand. It never
  locks anything.
- **Today and Later.** Each has a Should list and a Want list. Today shows
  everything due today or earlier, so overdue items stay until done or moved.
  Later holds dated items and "someday".
- **Recurring items** in either list: daily, chosen weekdays, weekly or every N
  days. Checking one off creates the next occurrence.
- **Fix timer.** Forgot to switch, or to stop? Say how long ago, what those
  minutes really were, and what you have been doing since.
- **Optional daily Should target.** When you reach it the app says you can stop.
- **A configurable end of day**, for anyone who works past midnight. A stint
  that crosses the boundary simply counts toward both days.

State lives on the device first, in `localStorage`, and works signed out. Sign in
with an emailed code (Settings, Sync) and it syncs between devices through
Supabase. Setup is in [`docs/supabase-setup.md`](docs/supabase-setup.md).

## Development

```bash
npm install
npx playwright install chromium   # once, for the e2e suite

npm run dev        # vite dev server on http://localhost:5173/third-time-todo/
npm run build      # typecheck (tsc -b) + production build to dist/
npm run lint       # eslint
npm run test:unit  # vitest: the ledger, recurrence, items, day keys
npm test           # playwright end-to-end suite
npm run preview    # serve the production build locally
```

Requires Node 20+. Lint, build and both test suites run on every PR via
`.github/workflows/ci.yml`.

## Code

React 19, TypeScript, Vite, Tailwind CSS 4 and zustand with `persist`.

- `src/utils/ledger.ts`: the time ledger. Pure functions: totals per day, the
  balance, start/stop, and `paint`, the one operation behind every correction.
- `src/utils/items.ts`, `recurrence.ts`: which view an item belongs in, and
  what completing a repeating item does.
- `src/utils/time.ts`: day keys and formatting.
- `src/sync/`: sync. `engine.ts` and `merge.ts` are pure and unit-tested against
  a simulated server; `remote.ts` is the Supabase side; `runtime.ts` wires it to
  the stores, auth and realtime.
- `supabase/migrations/`: the schema, with row level security.
- `src/store/`: three persisted stores, `timer` (the ledger), `items` and
  `settings`, under `tt2-*` keys.

The balance is never stored. It is derived from the ledger and the clock, and
the running timer is a start timestamp, so a suspended or killed app loses
nothing.

> Persisted stores are versioned. Changing a store's shape requires bumping its
> `version` and adding a `migrate`, or existing users lose data.

### Tests

`e2e/` runs against the dev server with a fake, paused clock, so every figure on
the timer is exact. Each test starts from an empty browser context and fails on
any console error.
