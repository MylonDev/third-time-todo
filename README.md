# Third Time

A local-first todo app built around the [Third Time](https://www.lesswrong.com/posts/RWu8eZqbwgB9zaerh/third-time-a-better-way-to-work)
break system: instead of fixed Pomodoro intervals, you work for as long as you
like and earn break time as a fraction of it. Breaks are banked, so you can
save them up or go into debt.

Live at **https://mylondev.github.io/third-time-todo/**

## Features

- **Break bank** — work accrues break time at your chosen ratio; the balance can
  go negative (debt) and carries through the day. There's no Start/End Session
  step; you just start a timer and stop it. The bank itself isn't stored — it's
  derived on the fly from a ledger of time entries, so trimming or moving an
  entry later moves the break it earned along with it.
- **Difficulty per day** — Locked in (1:4), Serious (1:3), Relaxed (1:2). Each
  day starts at your default and keeps its own mode; easing off once you've
  started uses a daily reduction (one by default, configurable), raising never
  does. The picker suggests a mode from your pace band. Each time entry
  remembers the mode it ran at, so a change is never retroactive.
- **Projects** — a name, an optional colour, an optional time target per period
  ("10h / week"), an optional deadline. Time accrues to a project forever; a
  project is archived, never "completed".
- **A weekly schedule** — the Tasks tab is seven day columns, This week or
  Rolling, filterable by project. Tasks can be planned for later days or set to
  repeat (daily, chosen weekdays, weekly, every N days); repeats are rules, so
  future occurrences show before they exist. Unfinished tasks stay on their day
  as missed, and today's Overdue strip pulls them forward. Subtasks, drag to
  reorder, and per-task time tracking; a task tagged to a project credits it.
- **A configurable end of day** — the day cuts over at midnight by default, but
  can be pushed to 1–4 AM for anyone who works past midnight. A timer left
  running across that boundary gets split there instead of stalling the day.
- **Activity** — daily history of work and rest, a pace band, and an editable
  day timeline: tap a block to trim, reassign, split or delete it; drag empty
  rail to add one you forgot to start. Totals re-sum from the ledger.
- Installable PWA with sound and notification cues. Everything is stored in
  `localStorage`; there is no account and no server.

## Development

```bash
npm install
npx playwright install chromium   # once, for the test suite

npm run dev      # vite dev server on http://localhost:5173
npm run build    # typecheck (tsc -b) + production build to dist/
npm run lint     # eslint
npm run test:unit # vitest unit suite
npm test         # playwright end-to-end suite (~12s)
npm run preview  # serve the production build locally
```

Requires Node 20+. `npm test` starts its own dev server, so nothing needs to
be running first. Lint, build and both test suites all run on every PR via
`.github/workflows/ci.yml`.

### Tests

`e2e/` covers the behaviours that only exist in a browser: the shared
one-second clock and that every panel advances off it, focused time accruing
and surviving a reload, dialogs trapping focus and closing on Escape, inline
editors committing and cancelling, empty states, and both colour themes. Each
test starts from an empty `localStorage` and fails on any console error.

`npm run test:unit` runs a vitest suite alongside it, for the logic that
doesn't need a browser: the migration chains for each store, the derived
break bank, and the day-boundary arithmetic.

## Stack

React 19, TypeScript, Vite 8, Tailwind CSS 4, zustand (with `persist`),
`@dnd-kit` for drag-and-drop, and framer-motion for animation.

State lives in four zustand stores under `src/store/` — `session`, `tasks`,
`projects`, `settings` — each persisted to its own `localStorage` key. The
break mechanic itself is pure and lives in `src/utils/thirdTime.ts`.

> Persisted stores are versioned. Changing a store's shape requires bumping its
> `version` and extending `migrate`, or existing users lose data.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages. `vite.config.ts` sets
`base: '/third-time-todo/'` to match the Pages path.
