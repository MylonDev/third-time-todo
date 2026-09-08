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

export interface DailyState {
  date: string; // YYYY-MM-DD
  bankMs: number; // can be negative (debt)
  sessions: SessionLog[];
  /** Running total for the day: each ended session adds what it left unspent. */
  unusedRestMs?: number;
  /**
   * When the open session began, or undefined when none is. A SessionLog is
   * one work stint; a session is everything from Start to End Session, which
   * may be several of them.
   */
  sessionStartedAt?: number;
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
  sessions: SessionLog[];
}

/** What to do with a task carried over from a previous day. */
export type TaskDisposition = 'keep' | 'mark-done' | 'discard';

// ── Tabs ──────────────────────────────────────────────────────────────────────

export type TabId = 'habits' | 'tasks' | 'goals' | 'activity';

// ── Focus ─────────────────────────────────────────────────────────────────────

export type FocusTarget =
  | { kind: 'task'; id: string }
  | { kind: 'goal'; id: string };

// ── Periods (shared by goals) ─────────────────────────────────────────────────

export type GoalPeriod = 'daily' | 'weekly' | 'custom';

// ── Habits ────────────────────────────────────────────────────────────────────

/**
 * How often a habit comes due. `weekdays` days are 0=Mon … 6=Sun. `everyN`
 * counts from the habit's `createdAt`.
 */
export type HabitFreq =
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'everyN'; n: number }
  | { kind: 'weekdays'; days: number[] };

export interface Habit {
  id: string;
  name: string;
  freq: HabitFreq;
  /** Optional per-occurrence quantity: "20 minutes", "10 pages". Absent = plain checkbox. */
  target?: { amount: number; unit: string };
  createdAt: number;
  order: number;
  /** dateKey (YYYY-MM-DD) → `true` for a checkbox tick, or the logged amount. */
  completions: Record<string, number | true>;
  archivedAt?: number;
}

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
  /** periodKey → amount logged that period. Sum across keys = cumulative total. */
  progress: Record<string, number>;
  archivedAt?: number;
  completedAt?: number;
}
