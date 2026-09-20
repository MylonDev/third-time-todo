import type { GoalPeriod, PeriodTarget, Project } from '../types';
import { formatDuration } from './thirdTime';
import { targetPeriodKey } from './goalPeriod';

/**
 * Everything logged against a project, across every period. Reads the
 * maintained `total.time` (which survives `prunePeriods`), falling back to
 * summing `progress.time` for a record written before that field existed.
 */
export function cumulativeTotal(project: Project): number {
  return project.total?.time ?? Object.values(project.progress.time).reduce((a, b) => a + b, 0);
}

/** A human total for the project's cumulative time. */
export function formatProjectTotal(project: Project): string {
  return formatDuration(cumulativeTotal(project));
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/** An amount of ms, for humans. */
export function formatMetricAmount(amount: number): string {
  return formatDuration(amount);
}

const PERIOD_LABEL: Record<GoalPeriod, string> = {
  daily: 'today',
  weekly: 'this week',
  custom: 'this period',
};

export function periodLabel(target: PeriodTarget): string {
  if (target.period === 'custom')
    return `this ${target.periodDays ?? 1}-day period`;
  return PERIOD_LABEL[target.period];
}

// ── Period target (this period vs target.amount) ─────────────────────────────

/** How much has been logged toward the period target in the current period. */
export function targetThisPeriod(project: Project, dayEndHour: number): number {
  if (!project.target) return 0;
  const key = targetPeriodKey(project.target, project.createdAt, dayEndHour);
  return project.progress.time[key] ?? 0;
}

export interface TargetReading {
  done: number;
  target: number;
  fraction: number;
  met: boolean;
  text: string;
}

export function targetReading(project: Project, dayEndHour: number): TargetReading | null {
  if (!project.target) return null;
  const done = targetThisPeriod(project, dayEndHour);
  const target = project.target.amount;
  const fraction = target > 0 ? done / target : 0;
  return {
    done,
    target,
    fraction,
    met: done >= target && target > 0,
    text: `${formatMetricAmount(done)} / ${formatMetricAmount(target)} ${periodLabel(project.target)}`,
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

export function paceReading(project: Project, now = Date.now()): PaceReading {
  if (!project.deadline) {
    return {
      comparable: false,
      onPace: true,
      text: 'Set a deadline to see whether you’re on pace.',
    };
  }

  const left = daysUntilDeadline(project.deadline, now);
  const daysLeftText =
    left > 1 ? `${left} days left` : left === 1 ? '1 day left' : left === 0 ? 'due today' : 'past deadline';

  // A project has no outcome number to pace a deadline against — just the countdown.
  return { comparable: false, onPace: true, text: daysLeftText };
}

// ── Add-form validity ────────────────────────────────────────────────────────

export interface ProjectDraft {
  name: string;
  targetEnabled: boolean;
  targetAmount: string;
  targetPeriod: GoalPeriod;
}

/** The invariant: a project just needs a name — the target and deadline are optional. */
export function projectDraftIsValid(d: ProjectDraft): boolean {
  return d.name.trim().length > 0;
}
