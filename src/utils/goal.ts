import type { Goal, GoalOutcome, GoalPeriod, EffortTarget } from '../types';
import { formatDuration } from './thirdTime';
import { effortPeriodKey } from './goalPeriod';

/**
 * Everything logged against a goal, across every period. Reads the maintained
 * `total` (which survives `prunePeriods`), falling back to summing `progress`
 * for a record written before that field existed.
 */
export function cumulativeTotal(goal: Goal): number {
  return goal.total ?? Object.values(goal.progress).reduce((a, b) => a + b, 0);
}

/**
 * The goal's outcome target in the same unit its progress is logged in
 * (milliseconds for a time goal, the count unit for a count goal), or `null`
 * for an open goal.
 */
export function outcomeTarget(goal: Goal): number | null {
  if (goal.outcome.kind === 'count') return goal.outcome.target;
  if (goal.outcome.kind === 'time') return goal.outcome.targetHours * 3_600_000;
  return null;
}

/** Fraction of the outcome reached (0–1+), or `null` when there is no number. */
export function outcomeProgress(goal: Goal): number | null {
  const target = outcomeTarget(goal);
  if (!target) return null;
  return cumulativeTotal(goal) / target;
}

/** Whether the goal has met its definition of done. */
export function isGoalMet(goal: Goal): boolean {
  if (goal.milestones.length > 0 && goal.milestones.every((m) => m.doneAt)) return true;
  const p = outcomeProgress(goal);
  return p != null && p >= 1;
}

/** A human total for the goal's cumulative progress. */
export function formatGoalTotal(goal: Goal): string {
  const total = cumulativeTotal(goal);
  if (goal.outcome.kind === 'time') return formatDuration(total);
  if (goal.outcome.kind === 'count') return `${Math.round(total)} ${goal.outcome.unit}`;
  // Open goal: its one bucket holds counts for a migrated boolean, else banked ms.
  if (goal.effort?.metric === 'count') return `${Math.round(total)} times`;
  return formatDuration(total);
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/** The short label for a goal's measure — "Time", "Count · km", "Open". */
export function measureLabel(outcome: GoalOutcome): string {
  if (outcome.kind === 'time') return 'Time';
  if (outcome.kind === 'count') return `Count · ${outcome.unit}`;
  return 'Open';
}

/** The outcome target, rendered for humans — "~150 h", "1,000 km", or null. */
export function formatOutcomeTarget(goal: Goal): string | null {
  if (goal.outcome.kind === 'time') return `${goal.outcome.targetHours} h`;
  if (goal.outcome.kind === 'count')
    return `${goal.outcome.target.toLocaleString()} ${goal.outcome.unit}`;
  return null;
}

/** An amount in a metric's own unit, for humans. */
export function formatMetricAmount(
  metric: EffortTarget['metric'],
  amount: number,
  unit: string
): string {
  if (metric === 'time') return formatDuration(amount);
  return `${Math.round(amount)} ${unit}`;
}

const PERIOD_LABEL: Record<GoalPeriod, string> = {
  daily: 'today',
  weekly: 'this week',
  custom: 'this period',
};

export function periodLabel(effort: EffortTarget): string {
  if (effort.period === 'custom')
    return `this ${effort.periodDays ?? 1}-day period`;
  return PERIOD_LABEL[effort.period];
}

// ── Effort target (this period vs effort.amount) ─────────────────────────────

/** The unit an effort target's amounts are counted in. */
export function effortUnit(goal: Goal): string {
  if (!goal.effort) return '';
  if (goal.effort.metric === 'time') return '';
  return goal.outcome.kind === 'count' ? goal.outcome.unit : 'times';
}

/** How much has been logged toward the effort target in the current period. */
export function effortThisPeriod(goal: Goal): number {
  if (!goal.effort) return 0;
  const key = effortPeriodKey(goal.effort, goal.createdAt);
  return goal.progress[key] ?? 0;
}

export interface EffortReading {
  done: number;
  target: number;
  fraction: number;
  met: boolean;
  text: string;
}

export function effortReading(goal: Goal): EffortReading | null {
  if (!goal.effort) return null;
  const done = effortThisPeriod(goal);
  const target = goal.effort.amount;
  const unit = effortUnit(goal);
  const fraction = target > 0 ? done / target : 0;
  return {
    done,
    target,
    fraction,
    met: done >= target && target > 0,
    text: `${formatMetricAmount(goal.effort.metric, done, unit)} / ${formatMetricAmount(
      goal.effort.metric,
      target,
      unit
    )} ${periodLabel(goal.effort)}`,
  };
}

// ── Pace ─────────────────────────────────────────────────────────────────────

/** A percentage width that is always a finite 0–100. */
export function widthPct(fraction: number | null | undefined): number {
  if (fraction == null || !Number.isFinite(fraction)) return 0;
  return Math.max(0, Math.min(100, fraction * 100));
}

/** Local midnight at the end of a YYYY-MM-DD day. */
function deadlineTime(deadline: string): number {
  const [y, m, d] = deadline.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Whole days between now and the deadline (negative once it has passed). */
export function daysUntilDeadline(deadline: string, now = Date.now()): number {
  return Math.ceil((deadlineTime(deadline) - now) / 86_400_000);
}

export interface PaceReading {
  /** Whether a real on-pace comparison was possible. */
  comparable: boolean;
  onPace: boolean;
  text: string;
}

export function paceReading(goal: Goal, now = Date.now()): PaceReading {
  if (!goal.deadline) {
    return {
      comparable: false,
      onPace: true,
      text: 'Set a deadline to see whether you’re on pace.',
    };
  }

  const left = daysUntilDeadline(goal.deadline, now);
  const daysLeftText =
    left > 1 ? `${left} days left` : left === 1 ? '1 day left' : left === 0 ? 'due today' : 'past deadline';

  const target = outcomeTarget(goal);
  if (target == null) {
    // Open outcome — no number to pace against. Fall back to milestone burn-down
    // when there are milestones, otherwise just the countdown.
    if (goal.milestones.length > 0) {
      const doneFrac = goal.milestones.filter((m) => m.doneAt).length / goal.milestones.length;
      const total = deadlineTime(goal.deadline) - goal.createdAt;
      const elapsedFrac = total > 0 ? Math.min(1, Math.max(0, (now - goal.createdAt) / total)) : 1;
      const onPace = doneFrac >= elapsedFrac;
      return {
        comparable: true,
        onPace,
        text: `${Math.round(doneFrac * 100)}% of milestones done, ${Math.round(
          elapsedFrac * 100
        )}% of the time gone · ${daysLeftText}`,
      };
    }
    return { comparable: false, onPace: true, text: daysLeftText };
  }

  const total = deadlineTime(goal.deadline) - goal.createdAt;
  const elapsedFrac = total > 0 ? Math.min(1, Math.max(0, (now - goal.createdAt) / total)) : 1;
  const expected = target * elapsedFrac;
  const actual = cumulativeTotal(goal);
  const onPace = actual >= expected;

  const fmt = (n: number) =>
    goal.outcome.kind === 'time'
      ? formatDuration(n)
      : `${Math.round(n).toLocaleString()} ${goal.outcome.kind === 'count' ? goal.outcome.unit : ''}`.trim();

  const gap = Math.abs(actual - expected);
  const verdict = onPace
    ? left < 0
      ? 'target reached before the deadline'
      : `on pace — ${fmt(gap)} ahead`
    : `behind by ${fmt(gap)}`;

  return { comparable: true, onPace, text: `${verdict} · ${daysLeftText}` };
}

// ── Lineage ──────────────────────────────────────────────────────────────────

/**
 * The evolve chain that runs through `id`, root first. Walks `evolvesFromId`
 * back to the root, then follows successors forward, guarding against a cycle
 * a hand-edited `evolvesFromId` could introduce.
 */
export function lineageChain(goals: Goal[], id: string): Goal[] {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const start = byId.get(id);
  if (!start) return [];

  const back: Goal[] = [];
  const seen = new Set<string>([id]);
  let cur = start.evolvesFromId ? byId.get(start.evolvesFromId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    back.unshift(cur);
    cur = cur.evolvesFromId ? byId.get(cur.evolvesFromId) : undefined;
  }

  const forward: Goal[] = [];
  let nextId = id;
  for (
    let child = goals.find((g) => g.evolvesFromId === nextId && !seen.has(g.id));
    child;
    child = goals.find((g) => g.evolvesFromId === nextId && !seen.has(g.id))
  ) {
    seen.add(child.id);
    forward.push(child);
    nextId = child.id;
  }

  return [...back, start, ...forward];
}

// ── Add-form validity ────────────────────────────────────────────────────────

export interface GoalDraft {
  title: string;
  measure: 'time' | 'count' | 'open';
  targetHours: string;
  unit: string;
  count: string;
  milestones: { id?: string; label: string }[];
  effortEnabled: boolean;
  effortAmount: string;
}

export function draftHasOutcomeNumber(d: GoalDraft): boolean {
  if (d.measure === 'time') return Number(d.targetHours) > 0;
  if (d.measure === 'count') return Number(d.count) > 0;
  return false;
}

/**
 * The invariant: a goal needs an outcome number, or at least one milestone, or
 * a recurring effort target. Otherwise it is just a task.
 */
export function goalDraftIsValid(d: GoalDraft): boolean {
  if (!d.title.trim()) return false;
  const hasMilestone = d.milestones.some((m) => m.label.trim());
  const hasEffort = d.effortEnabled && Number(d.effortAmount) > 0;
  return draftHasOutcomeNumber(d) || hasMilestone || hasEffort;
}
