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
  /** The project this task's tracked time is credited to, if any. */
  projectId?: string;
  /**
   * Legacy — tasks spawned by the old routines feature carried these. Routines
   * are gone; such tasks stay filtered out of the list. New tasks never set them.
   */
  routineId?: string;
  routinePeriodKey?: string;
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

export type TabId = 'tasks' | 'projects' | 'activity';

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

// ── Projects ──────────────────────────────────────────────────────────────────

/**
 * A recurring commitment that resets each period, e.g. "10 hours / week".
 * Count targets aren't offered yet — every project is time-trackable, but the
 * `progress`/`total` maps below are already keyed by metric so a count target
 * can be added later without a second migration.
 */
export interface PeriodTarget {
  metric: 'time';
  amount: number; // ms
  period: GoalPeriod;
  periodDays?: number; // custom only
}

export interface Project {
  id: string;
  name: string;
  color?: string; // swatch for the timeline and task tags
  target?: PeriodTarget;
  deadline?: string; // YYYY-MM-DD; absent = no pace readout
  createdAt: number;
  order: number;
  /** metric → periodKey → amount. Time values are ms. */
  progress: { time: Record<string, number> };
  /** metric → running cumulative total, immune to `prunePeriods`. */
  total: { time: number };
  archivedAt?: number;
}
