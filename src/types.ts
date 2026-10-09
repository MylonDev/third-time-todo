/** What the running timer is spent on. Stopped is not a state: it is rest. */
export type TimerState = 'should' | 'want';

/**
 * One stretch of time in a state. The ledger is append-only in spirit: an edit
 * rewrites `startedAt`/`endedAt` or tombstones the entry, and bumps `updatedAt`
 * so a later sync can merge by last-writer-wins. Duration is never stored.
 */
export interface TimeEntry {
  id: string;
  state: TimerState;
  /** ms epoch */
  startedAt: number;
  /** null marks the one running entry */
  endedAt: number | null;
  updatedAt: number;
  /** Set instead of removing the entry, so a delete can sync. */
  deletedAt?: number;
}

/**
 * How often an item comes back. `weekdays` days are 0=Mon … 6=Sun. `weekly`
 * repeats on the weekday of the item's current due date.
 */
export type Recurrence =
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'everyN'; n: number }
  | { kind: 'weekdays'; days: number[] };

/** A checklist line. It has no timer: time is tracked per state, not per item. */
export interface Item {
  id: string;
  text: string;
  kind: TimerState;
  /** Day key. Null means Later, with no date ("someday"). */
  dueOn: string | null;
  done: boolean;
  doneAt?: number;
  repeat?: Recurrence;
  /** Shared by every occurrence of a repeating item; defaults to its own id. */
  seriesId?: string;
  /** The occurrence that completing this one created. */
  nextId?: string;
  order: number;
  updatedAt: number;
  deletedAt?: number;
}

export type Theme = 'system' | 'light' | 'dark';
