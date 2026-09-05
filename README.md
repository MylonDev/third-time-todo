# Third Time

A local-first todo app built around the [Third Time](https://www.lesswrong.com/posts/RWu8eZqbwgB9zaerh/third-time-a-better-way-to-work)
break system: instead of fixed Pomodoro intervals, you work for as long as you
like and earn break time as a fraction of it. Breaks are banked, so you can
save them up or go into debt.

Live at **https://mylondev.github.io/third-time-todo/**

## Features

- **Break bank** — work accrues break time at your chosen ratio; the balance can
  go negative (debt) and carries through the day.
- **Difficulty modes** — Hard (1:4), Medium (1:3), Easy (1:2).
- **Tasks and subtasks** — drag to reorder, per-task time tracking, and an
  end-of-day flow for whatever is left over.
- **Routines** — named groups of recurring tasks that spawn into today's list on
  each daily/weekly/custom period turnover, with adherence history.
- **Goals** — boolean, counter, or time-based, tracked per period.
- **Activity** — daily history of work, break, and unused rest time.
- Installable PWA with sound and notification cues. Everything is stored in
  `localStorage`; there is no account and no server.

## Development

```bash
npm install
npx playwright install chromium   # once, for the test suite

npm run dev      # vite dev server on http://localhost:5173
npm run build    # typecheck (tsc -b) + production build to dist/
npm run lint     # eslint
npm test         # playwright end-to-end suite (~12s)
npm run preview  # serve the production build locally
```

Requires Node 20+. `npm test` starts its own dev server, so nothing needs to
be running first. Lint, build and tests all run on every PR via
`.github/workflows/ci.yml`.

### Tests

`e2e/` covers the behaviours that only exist in a browser: the shared
one-second clock and that every panel advances off it, focused time accruing
and surviving a reload, dialogs trapping focus and closing on Escape, inline
editors committing and cancelling, empty states, and both colour themes. Each
test starts from an empty `localStorage` and fails on any console error.

## Stack

React 19, TypeScript, Vite 8, Tailwind CSS 4, zustand (with `persist`),
`@dnd-kit` for drag-and-drop, and framer-motion for animation.

State lives in four zustand stores under `src/store/` — `session`, `tasks`,
`goals`, `settings` — each persisted to its own `localStorage` key. The break
mechanic itself is pure and lives in `src/utils/thirdTime.ts`.

> Persisted stores are versioned. Changing a store's shape requires bumping its
> `version` and extending `migrate`, or existing users lose data.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages. `vite.config.ts` sets
`base: '/third-time-todo/'` to match the Pages path.
