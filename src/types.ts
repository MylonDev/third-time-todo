/**
 * What the Flow timer is spent on. Stored as `should` and `want`; the screen
 * calls them Focus (should) and Rest (want). Stopped is not a state: it is no entry.
 */
export type TimerState = 'should' | 'want';

/**
 * What an entry in the ledger can be. `timed` is a count-down session: history
 * only, so it never touches the Flow balance.
 */
export type EntryState = TimerState | 'timed';

/**
 * One stretch of time in a state. The ledger is append-only in spirit: an edit
 * rewrites `startedAt`/`endedAt` or tombstones the entry, and bumps `updatedAt`
 * so a later sync can merge by last-writer-wins. Duration is never stored.
 */
export interface TimeEntry {
  id: string;
  state: EntryState;
  /** ms epoch */
  startedAt: number;
  /** null marks the one running entry */
  endedAt: number | null;
  /** How long a `timed` entry was set to run. The entry closes itself at `startedAt + plannedMs`. */
  plannedMs?: number;
  /**
   * The practice this time was spent on. Time counts toward a practice only in
   * `should` and `timed` entries; a Rest entry may carry it just so a Flow
   * stretch stays one session.
   */
  practiceId?: string;
  updatedAt: number;
  /** Set instead of removing the entry, so a delete can sync. */
  deletedAt?: number;
}

/**
 * How often an item comes back. `weekdays` days are 0=Mon … 6=Sun. `weekly`
 * repeats on the weekday of the item's current due date.
 */
export type Recurrence = { kind: 'daily' } | { kind: 'weekly' } | { kind: 'everyN'; n: number } | { kind: 'weekdays'; days: number[] };

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

/**
 * A hobby or skill with no end point. It has a weekly target: how many days,
 * optionally on which weekdays, and how many minutes a day. Time is not stored
 * on it: a day counts by the minutes the ledger holds for it.
 */
export interface Practice {
  id: string;
  name: string;
  /** Days a week, 0 to 7. Zero is Paused. With `targetWeekdays` chosen it is their count. */
  targetDays: number;
  /** The chosen weekdays, 0=Mon … 6=Sun, in order. Empty means any day. */
  targetWeekdays: number[];
  /** Minutes of Focus or Timed a day takes to count. */
  targetMin: number;
  /** Written at the end of a session, shown at the start of the next. */
  nextStep?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  /** Set instead of removing the practice, so a delete can sync. Its time stays in the ledger. */
  deletedAt?: number;
}

/** One line of the Get ready checklist. The list lives in the settings. */
export interface GetReadyStep {
  id: string;
  text: string;
}

/**
 * What happened to the checklist on one day. Its existence also means the
 * checklist was already offered that day. Nothing deletes a day, so it has no
 * tombstone. `done` holds step ids, so a rename keeps the history.
 */
export interface GetReadyDay {
  /** The day key. */
  id: string;
  done: string[];
  skipped: boolean;
  updatedAt: number;
}

export type Theme = 'system' | 'light' | 'dark';
