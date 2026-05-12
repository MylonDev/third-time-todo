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
  estimateMin?: number;
  status: TaskStatus;
  createdAt: number;
  scheduledDate: string; // YYYY-MM-DD
  order: number;
  subtasks: SubTask[];
  trackedMs: number; // cumulative milliseconds focused while timer was running
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
  unusedRestMs?: number; // captured when session ends
}

export interface SessionReport {
  totalWorkMs: number;
  totalBreakMs: number;
  unusedRestMs: number;
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

export type TaskDisposition = 'move-to-tomorrow' | 'mark-done' | 'discard';

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
  target: number;        // boolean: 1 | counter: N times | time: ms
  deadline?: string;     // YYYY-MM-DD, optional
  createdAt: number;
  order: number;
  progress: Record<string, number>; // periodKey → accumulated value
}
