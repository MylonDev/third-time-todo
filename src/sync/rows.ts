import type { EntryState, Item, Need, Practice, PracticeLevel, Recurrence, TimeEntry, TimerState } from '../types';

/** The part of the settings that changes the numbers, so it follows you between devices. */
export interface SyncedSettings {
  dayEndHour: number;
  shouldTargetMin: number | null;
  weeklyCapMin: number | null;
  /** 0 until the user changes either value, so defaults never beat a real setting. */
  updatedAt: number;
}

export interface EntryRow {
  id: string;
  state: EntryState;
  started_at: number;
  ended_at: number | null;
  /** Only present on Timed entries; the column is nullable. */
  planned_ms?: number | null;
  /** Only present on an entry for a practice; the column is nullable. */
  practice_id?: string | null;
  updated_at: number;
  deleted_at: number | null;
}

export interface ItemRow {
  id: string;
  text: string;
  kind: TimerState;
  due_on: string | null;
  done: boolean;
  done_at: number | null;
  repeat: Recurrence | null;
  series_id: string | null;
  next_id: string | null;
  sort_order: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface PracticeRow {
  id: string;
  name: string;
  level: PracticeLevel;
  small_step: string;
  low_step: string;
  small_needs: Need[];
  low_needs: Need[];
  next_step: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface SettingsRow {
  day_end_hour: number;
  should_target_min: number | null;
  /** Null when unset, or when the column predates practices. */
  weekly_cap_min?: number | null;
  updated_at: number;
}

// Postgres returns bigint columns as numbers through PostgREST for values this
// size, but be strict: a string would silently break every comparison.
const num = (v: number | string): number => (typeof v === 'number' ? v : Number(v));
const numOrUndef = (v: number | string | null): number | undefined => (v === null ? undefined : num(v));

export function entryToRow(e: TimeEntry): EntryRow {
  return {
    id: e.id,
    state: e.state,
    started_at: e.startedAt,
    ended_at: e.endedAt,
    // Left out unless set, so a Flow entry's row is the same as it always was.
    ...(e.plannedMs !== undefined && { planned_ms: e.plannedMs }),
    ...(e.practiceId !== undefined && { practice_id: e.practiceId }),
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt ?? null,
  };
}

export function rowToEntry(r: EntryRow): TimeEntry {
  const deletedAt = numOrUndef(r.deleted_at);
  const plannedMs = numOrUndef(r.planned_ms ?? null);
  const practiceId = r.practice_id ?? undefined;
  return {
    id: r.id,
    state: r.state,
    startedAt: num(r.started_at),
    endedAt: r.ended_at === null ? null : num(r.ended_at),
    updatedAt: num(r.updated_at),
    ...(plannedMs !== undefined && { plannedMs }),
    ...(practiceId !== undefined && { practiceId }),
    ...(deletedAt !== undefined && { deletedAt }),
  };
}

export function itemToRow(i: Item): ItemRow {
  return {
    id: i.id,
    text: i.text,
    kind: i.kind,
    due_on: i.dueOn,
    done: i.done,
    done_at: i.doneAt ?? null,
    repeat: i.repeat ?? null,
    series_id: i.seriesId ?? null,
    next_id: i.nextId ?? null,
    sort_order: i.order,
    updated_at: i.updatedAt,
    deleted_at: i.deletedAt ?? null,
  };
}

export function rowToItem(r: ItemRow): Item {
  const doneAt = numOrUndef(r.done_at);
  const deletedAt = numOrUndef(r.deleted_at);
  return {
    id: r.id,
    text: r.text,
    kind: r.kind,
    dueOn: r.due_on,
    done: r.done,
    order: Number(r.sort_order),
    updatedAt: num(r.updated_at),
    ...(doneAt !== undefined && { doneAt }),
    ...(r.repeat !== null && { repeat: r.repeat }),
    ...(r.series_id !== null && { seriesId: r.series_id }),
    ...(r.next_id !== null && { nextId: r.next_id }),
    ...(deletedAt !== undefined && { deletedAt }),
  };
}

export function practiceToRow(p: Practice): PracticeRow {
  return {
    id: p.id,
    name: p.name,
    level: p.level,
    small_step: p.smallStep,
    low_step: p.lowStep,
    small_needs: p.smallNeeds,
    low_needs: p.lowNeeds,
    next_step: p.nextStep ?? null,
    sort_order: p.order,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt ?? null,
  };
}

export function rowToPractice(r: PracticeRow): Practice {
  const deletedAt = numOrUndef(r.deleted_at);
  return {
    id: r.id,
    name: r.name,
    level: r.level,
    smallStep: r.small_step,
    lowStep: r.low_step,
    smallNeeds: r.small_needs,
    lowNeeds: r.low_needs,
    order: Number(r.sort_order),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
    ...(r.next_step !== null && { nextStep: r.next_step }),
    ...(deletedAt !== undefined && { deletedAt }),
  };
}

export function settingsToRow(s: SyncedSettings): SettingsRow {
  return {
    day_end_hour: s.dayEndHour,
    should_target_min: s.shouldTargetMin,
    weekly_cap_min: s.weeklyCapMin,
    updated_at: s.updatedAt,
  };
}

export function rowToSettings(r: SettingsRow): SyncedSettings {
  return {
    dayEndHour: r.day_end_hour,
    shouldTargetMin: r.should_target_min,
    weeklyCapMin: r.weekly_cap_min ?? null,
    updatedAt: num(r.updated_at),
  };
}
