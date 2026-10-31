# Product concept: direction, small steps, non-zero days

**Status:** Concept, agreed in discussion on 17–18 Oct 2026. Not built. It replaces
the centre of the two-state spec ([2026-10-09-two-state-rebuild.md](2026-10-09-two-state-rebuild.md)):
the Should/Want timer becomes one of two timer modes instead of the whole app.
Work is tracked in kata (project `third-time-todo`), one epic per section below.
The brainstorm items were settled in a second pass on 18 Oct; each decision is
recorded on its kata issue, and this document is updated to match.

**31 Oct 2026:** Practices, Get ready and the First-run check were removed to focus
the app on its core (swhb). They were built, then taken out; see "Dropped in
discussion". The Daily check still needs its goals redefined without them.

## The problem

The app is for one person who feels stuck: who knows what matters to them but
doesn't take the steps, or overdoes it, burns out, and then does nothing.

- **No direction.** There are hobbies to pursue, things to learn, make and watch,
  but at the moment of choosing, nothing pulls towards them, and the day drifts
  into mindless things.
- **Bad calibration.** All or nothing: too much, then a crash.
- **Starting is hard.** The cobwebs (water, food, air, vitamins, a clear desk) sit
  between you and real work.
- **Some days are bad.** On those days, one small step is the whole goal, and
  it should count.

## Principles

- **Direction over accounting.** Time is tracked to show what has built up and to
  motivate, not to audit.
- **Small steps, repeated often.** Frequency beats length. A little, done regularly,
  keeps a skill alive.
- **One is better than zero.** A day with any intentional step counts.
- **Not prescriptive by default.** The app guides only when asked, mostly on low
  days. It never locks or blocks.
- **Practical, relaxed, plain words.** No quirky or poetic names.
- **For one person.** No sharing or partner features.

## Timer modes

| Mode      | Logic                                                                                             | For                                            |
| --------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Flow**  | Counts up. Focus earns Rest at 1:3, debt allowed. This is the current Should/Want timer, renamed. | Sustained, open-ended work over several hours. |
| **Timed** | Counts down from a chosen length, chimes at the end, and the session is done.                     | "This one session is what I have".             |

- **Flow's states are Focus, Rest and Stopped** (a260). Focus replaces Should and
  earns Rest. Rest replaces Want and spends the balance, which reads "Rest
  available" or "Rest debt". Stopped is the third state: the timer is off and
  nothing is spent. The wording must keep Rest (spends) apart from Stopped (free).
- Starting Flow opens a short **planning step**: "What's the most important task
  today?", picked from the Inbox or typed, then optionally more items for Today.
- Timed skips planning.
- **Past the day end** (7mfa): if the timer is running in Focus or Rest at the day
  end, the balance (rest or debt) carries on. It resets at the first Stop after the
  day end, which asks to confirm when rest is left ("Stopping clears 25m of rest").
  History still splits time at the day end.
- **Alerts** (asyj, n7tv): a chime when Timed ends and once when Rest goes into
  debt. With the phone locked these come by **scheduled web push**: both times are
  known when the state starts, so the client writes a "send at" row to Supabase and
  replaces it on every change; pg_cron and an Edge Function send it as a Declarative
  Web Push. Push needs the Home Screen install, sign-in and permission from a tap.

## Daily check and effort level

Optional, a few taps:

- **Mental clarity**: Low / Medium / High
- **Physical condition**: Low / Medium / High
- **Motivation**: Low / Medium / High

The answers set the day's **effort level**:

| Effort level | When        |
| ------------ | ----------- |
| Low          | mostly Low  |
| Steady       | mixed       |
| Full         | mostly High |

The goal of each level was written in terms of practices and needs redefining
(8f0p).

## Inbox and Today

- **Inbox**: fast capture of everything in your head. One line each, no dates,
  no sorting.
- **Today**: picked from the Inbox, in order. The top unfinished item is "now";
  work goes top-down.
- **Most important task**: set in Flow's planning step and pinned on top.
- **No cap on Today** (kq83). Once Today holds more than you usually finish, a
  quiet line says so ("You usually finish about 4"). It shows only after about a
  week of history, and never blocks.
- **Morning review** (8f2k). On the first open after the day end, yesterday's
  unticked Today items are listed. Each can be marked done (it counts for
  yesterday) or kept for today; the rest go to the Inbox. Skipping the review, or
  never opening it, sends them all to the Inbox. There is no evening ritual.

**Moving the current lists** (mbgt). The Should and Want lists become one Inbox
with no tag. Due dates are dropped: items due today or overdue go to Today, the
rest to the Inbox, with a future date kept as text on the line. Repeating items go
through a one-time review sheet after the update: each becomes a Today repeat (it
lands in Today on its day) or is dropped.

## History

- **Heatmap**, GitHub style, shaded by intentional time. Low-effort non-zero days
  show dim but present; zero days are empty.
- **Non-zero streak**: days in a row with any intentional step.
- **Weekly report**, shown once at the start of the week and kept in history:
  total time, non-zero days out of 7, tasks done, and how many days the most
  important task got done.

## Layout

- **Phone** (zfbg): a bottom tab bar with Today (timer and scene on top, the Today
  list below), Inbox and Days. Settings sits behind an icon.
- **Desktop**, from 1024 px: two columns. Left, sticky: scene, timer, then Today.
  Right: tabs for Inbox and Days.
- Tab title shows the running clock, and keys drive the timer (b478).

## Scene

Direction only; the detailed design is a later deep-dive (zw69, 86dq).

- The sun and moon follow the real clock: real sunrise and sunset for the user's
  area, and the real moon phase at night.
- Weather is real (Open-Meteo, opt-in rough location), and the user can pick a
  weather by hand instead.
- The deep-dive starts with a spec table of every dimension and the aesthetic (the
  mostly-green look is probably not staying), then mocks, then the build with a
  dev-only playground.
- One idea: a motif per month (falling leaves in autumn, sakura in spring).

## Name

Open (heb4). The direction is a short, real word with a helpful second layer,
Japanese-inspired or a mix, written without kanji, like _kata_. **Kotsu** leads:
_kotsu-kotsu_ is steady, bit-by-bit effort, and _kotsu_ alone is a knack. "Third
Time" is Bytesize's protocol name and now describes only Flow.

## Dropped in discussion

- Asking "was it worth it?" after each session.
- Practices (hobbies with weekly targets, a weekly cap and Needs attention), Get
  ready (a checklist before the first session) and the First-run check that seeded
  them. Built, then removed on 31 Oct to focus on the core (swhb).
- Daily item caps tied to effort level.
- Aims on a running Flow stint, which Timed covers.
- Growing-gap repeats (1, 2, 4, 8 days): a technique for memorising facts, and
  against "repeated often" for skills (2rbp).
- Partner or body-double mode (4bs1), and a share card for a day or week (47zh).
- An evening closing ritual, replaced by the morning review.

## Prototype

A rough proof of concept was built before this discussion. It lives on branch
`claude/brainstorm-features` (worktree `.claude/worktrees/brainstorm`) and
includes a Days view with heatmap and streak, a pre-flight checklist, chimes, a
debt hint, the desktop layout, tab title and keyboard keys. Design mocks are on the
Claude Design canvas "Third Time: brainstorm ideas". Reuse what fits; none of it
is merged.
