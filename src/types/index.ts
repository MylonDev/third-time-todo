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
  routineId?: string;        // spawned from a routine
  routinePeriodKey?: string; // which of that routine's periods it belongs to
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

// ── Focus ─────────────────────────────────────────────────────────────────────

export type FocusTarget =
  | { kind: 'task'; id: string }
  | { kind: 'goal'; id: string };

// ── Goals ─────────────────────────────────────────────────────────────────────

export type GoalType = 'boolean' | 'counter' | 'time'; // time values are ms
export type GoalPeriod = 'daily' | 'weekly' | 'custom';

export interface Goal {
  id: string;
  title: string;
  type: GoalType;
  period: GoalPeriod;
  periodDays?: number;   // only when period === 'custom'
  periodAnchor?: number; // custom windows count from here; reset when periodDays changes
  target: number;        // boolean: 1 | counter: N times | time: ms
  createdAt: number;
  order: number;
  progress: Record<string, number>; // periodKey → accumulated value
}

// ── Routines ───────────────────────────────────────────────────────────────────

/** A template line in a routine. It has no state — the spawned Task carries that. */
export interface RoutineItem {
  id: string;
  title: string;
}

/**
 * A named group of recurring tasks. Each period turnover spawns one Task per
 * item into today's list, tagged with `routineId` so the list can group them.
 */
export interface Routine {
  id: string;
  title: string;
  period: GoalPeriod;
  periodDays?: number;
  items: RoutineItem[];
  createdAt: number;
  order: number;
  lastSpawnKey?: string; // periodKey the items were last spawned for
  snoozedUntil?: string; // YYYY-MM-DD; skip spawning while today < this
}

/** What a routine achieved in one of its periods, recorded when that period closes. */
export interface RoutinePeriodRecord {
  done: number;
  total: number;
  trackedMs: number;
  skipped?: boolean;
}

/** routineId → periodKey → outcome */
export type RoutineHistory = Record<string, Record<string, RoutinePeriodRecord>>;
