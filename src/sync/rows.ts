import type { Item, Recurrence, TimeEntry, TimerState } from '../types';

/** The part of the settings that changes the numbers, so it follows you between devices. */
export interface SyncedSettings {
  dayEndHour: number;
  shouldTargetMin: number | null;
  /** 0 until the user changes either value, so defaults never beat a real setting. */
  updatedAt: number;
}

export interface EntryRow {
  id: string;
  state: TimerState;
  started_at: number;
  ended_at: number | null;
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

export interface SettingsRow {
  day_end_hour: number;
  should_target_min: number | null;
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
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt ?? null,
  };
}

export function rowToEntry(r: EntryRow): TimeEntry {
  const deletedAt = numOrUndef(r.deleted_at);
  return {
    id: r.id,
    state: r.state,
    startedAt: num(r.started_at),
    endedAt: r.ended_at === null ? null : num(r.ended_at),
    updatedAt: num(r.updated_at),
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

export function settingsToRow(s: SyncedSettings): SettingsRow {
  return {
    day_end_hour: s.dayEndHour,
    should_target_min: s.shouldTargetMin,
    updated_at: s.updatedAt,
  };
}

export function rowToSettings(r: SettingsRow): SyncedSettings {
  return {
    dayEndHour: r.day_end_hour,
    shouldTargetMin: r.should_target_min,
    updatedAt: num(r.updated_at),
  };
}
