# Product concept: direction, small steps, non-zero days

**Status:** Concept, agreed in discussion on 17–18 Oct 2026. Not built. It replaces
the centre of the two-state spec ([2026-10-09-two-state-rebuild.md](2026-10-09-two-state-rebuild.md)):
the Should/Want timer becomes one of two timer modes instead of the whole app.
Work is tracked in kata (project `third-time-todo`), one epic per section below.

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
- **Protect against overdoing it.** Commitments have a weekly cap the user sets.
- **Practical, relaxed, plain words.** No quirky or poetic names.

## Timer modes

| Mode | Logic | For |
| --- | --- | --- |
| **Flow** | Counts up. Active time earns rest at 1:3, debt allowed. This is the current Should/Want timer. | Sustained, open-ended work over several hours. |
| **Timed** | Counts down from a chosen length, chimes at the end, and the session is done. | "This one session is what I have", or a set block for a practice. |

- Starting Flow opens a short **planning step**: "What's the most important task
  today?", picked from the Inbox or typed, then optionally more items for Today.
- Timed skips planning.
- Either mode can be attached to a practice, so its time adds to that practice.
- Whether Flow keeps the words Should/Want is still open (brainstorm).

## Practices

A practice is a hobby, skill or interest with no end point: guitar, digital art,
photography, a language. ("Practice" is the working name; see brainstorm.)

Each practice has:

- **A commitment level** that sets a weekly target:

  | Level | Rhythm | Session | ≈ per week |
  | --- | --- | --- | --- |
  | Paused | — | — | 0 |
  | Minimal | 1× a week | 10–15 min | 15 min |
  | Light | 2–3× a week | 15–20 min | 45 min |
  | Steady | 4–5× a week | 20–30 min | 2 h |
  | Serious | daily | 30–60 min | 5 h |
  | Deep | daily | 1–2 h | 10 h |

  These numbers are a starting point. They are to be checked against habit and
  skill-retention research before they are fixed (kata ticket).
- **A small step**: the smallest session that still counts, with a smaller
  version for low days. Each is tagged with what it needs (clarity, physical
  energy, little of either) so the daily check can match it.
- **Accumulated time**: per week and in total ("Guitar: 2h 10m this week, 31h
  since June"). This is the reward, since a practice is never finished.
- **A next step**: written at the end of a session and shown at the start of
  the next, so starting is already decided.

**Weekly cap.** The user sets a weekly total, e.g. 8 h. The sum of all practices'
levels must stay under it. Raising one practice past the cap means lowering
another. This is where burnout is caught: when planning, not after the crash.

**Needs attention.** Practices are ranked by how far behind their weekly target
they are, given how much of the week is left. The top one to three show on the
home screen as suggestions.

## Daily check and effort level

Optional, a few taps:

- **Mental clarity**: Low / Medium / High
- **Physical condition**: Low / Medium / High
- **Motivation**: Low / Medium / High

The answers set the day's **effort level**:

| Effort level | When | Goal |
| --- | --- | --- |
| Low | mostly Low | Non-zero: one small step, or one get-ready item |
| Steady | mixed | Practices at their usual session length |
| Full | mostly High | A good day for the practice furthest behind, or a long Flow session |

Which answer is lowest also shapes what gets suggested: low clarity points to
hands-on, repetitive things; low physical condition points to seated, mental ones.

## Get ready

The user's own checklist for clearing the cobwebs: desk, water, food, air,
vitamins. It's offered before the day's first session and can always be skipped.
On a Low day, a get-ready item on its own makes the day non-zero.

## Inbox and Today

- **Inbox**: fast capture of everything in your head. One line each, no dates,
  no sorting.
- **Today**: picked from the Inbox, in order. The top unfinished item is "now";
  work goes top-down.
- **Most important task**: set in Flow's planning step and pinned on top.
- Unfinished items go back to the Inbox when the day ends.
- Whether Today has a size limit, and how big, is still open (brainstorm). The
  firm cap in this concept is the weekly hours for practices.

## First-run check

A short questionnaire the first time the app opens:

- what you want to make room for (seeds practices);
- what you need before you can start well (seeds get ready);
- what usually pulls you off course (a mirror, no blocking);
- when in the day you have the most energy.

It can be retaken from Settings.

## History

- **Heatmap**, GitHub style, shaded by intentional time. Low-effort non-zero days
  show dim but present; zero days are empty.
- **Non-zero streak**: days in a row with any intentional step.
- **Weekly report**, shown once at the start of the week and kept in history:
  each practice against its target (met / partly / missed), time per practice and
  in total, non-zero days out of 7, tasks done, how many days the most important
  task got done, and one suggestion (e.g. lower a practice that has been behind
  for three weeks).

## Dropped in discussion

- Asking "was it worth it?" after each session.
- Daily item caps tied to effort level. The cap is weekly hours instead.
- Aims on a running Flow stint, which Timed covers.

## Prototype

A rough proof of concept was built before this discussion. It lives on branch
`claude/brainstorm-features` (worktree `.claude/worktrees/brainstorm`) and
includes a Days view with heatmap and streak, a pre-flight checklist, chimes, a
debt hint, the desktop layout, tab title and keyboard keys. Design mocks are on the
Claude Design canvas "Third Time: brainstorm ideas". Reuse what fits; none of it
is merged.
