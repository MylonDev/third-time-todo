export type Mode = 'quarter' | 'third' | 'half';

export type TaskStatus = 'todo' | 'done';

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
  scheduledDate: string; // YYYY-MM-DD
  order: number;
  subtasks: SubTask[];
  trackedMs: number; // cumulative milliseconds focused while timer was running
  /**
   * Legacy — tasks spawned by the old routines feature carried these. Routines
   * are gone; such tasks stay filtered out of the list. New tasks never set them.
   */
  routineId?: string;
  routinePeriodKey?: string;
}

export interface SessionLog {
  id: string;
  workMs: number;
  breakMs: number;
  mode: Mode;
  startedAt: number;
}

export interface TimeEntry {
  id: string;
  kind: 'work' | 'break';
  /** Wall clock. Duration is always `endedAt - startedAt`; it is never stored. */
  startedAt: number;
  endedAt: number;
  projectId?: string; // work entries only
  taskId?: string;    // work entries only; implies the task's project
  /** The ratio in force when this ran, so changing difficulty is never retroactive. */
  mode: Mode;
}

export interface DailyState {
  date: string; // day key, per `dayKeyOf`
  entries: TimeEntry[];
}

/** What the session that just ended did, plus where that leaves the day. */
export interface SessionReport {
  totalWorkMs: number;
  totalBreakMs: number;
  unusedRestMs: number;
  dayWorkMs: number;
  dayBreakMs: number;
  mode: Mode;
  completedTasks: number;
  totalTasks: number;
}

export interface HistoryEntry {
  date: string; // YYYY-MM-DD
  totalWorkMs: number;
  totalBreakMs: number;
  unusedRestMs: number;
  entries: TimeEntry[];
}

/** What to do with a task carried over from a previous day. */
export type TaskDisposition = 'keep' | 'mark-done' | 'discard';

// ── Tabs ──────────────────────────────────────────────────────────────────────

export type TabId = 'tasks' | 'goals' | 'activity';

// ── Focus ─────────────────────────────────────────────────────────────────────

export type FocusTarget =
  | { kind: 'task'; id: string }
  | { kind: 'goal'; id: string };

// ── Periods (shared by goals) ─────────────────────────────────────────────────

export type GoalPeriod = 'daily' | 'weekly' | 'custom';

// ── Recurrence ────────────────────────────────────────────────────────────────

/**
 * How often something comes due. Kept from the old habits feature for the
 * weekly task schedule, which reuses the same due-date predicate. `weekdays`
 * days are 0=Mon … 6=Sun. `everyN` counts from an anchor timestamp supplied by
 * the caller.
 */
export type Recurrence =
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'everyN'; n: number }
  | { kind: 'weekdays'; days: number[] };

// ── Goals ─────────────────────────────────────────────────────────────────────

export type GoalOutcome =
  | { kind: 'count'; unit: string; target: number } // 1,000 km · 12 books
  | { kind: 'time'; targetHours: number }
  | { kind: 'open' };

/**
 * A recurring commitment that resets each period, e.g. "10 hours / week".
 * For `metric: 'time'`, `amount` and the matching `progress` values are in
 * milliseconds (what the session store commits). For `metric: 'count'`, they
 * are in the outcome's unit.
 */
export interface EffortTarget {
  metric: 'time' | 'count';
  amount: number;
  period: GoalPeriod;
  periodDays?: number; // custom only
}

export interface GoalMilestone {
  id: string;
  label: string;
  doneAt?: number;
}

export interface Goal {
  id: string;
  title: string;
  outcome: GoalOutcome;
  milestones: GoalMilestone[];
  effort?: EffortTarget;
  deadline?: string; // YYYY-MM-DD; absent = no pace readout
  doneWhen?: string; // free-text criterion
  evolvesFromId?: string;
  createdAt: number;
  order: number;
  /** periodKey → amount logged that period. Used for the current-period effort reading. */
  progress: Record<string, number>;
  /**
   * Running cumulative total, in the same unit as `progress` values. Mirrors the
   * sum of `progress` but is maintained on every write, so it stays correct even
   * after `prunePeriods` drops old buckets on a years-long goal.
   */
  total: number;
  archivedAt?: number;
  completedAt?: number;
}
