import type { Item, Recurrence, TimerState } from '../types';
import { nextDueKey } from './recurrence';
import { daysBetween, type DayWindow } from './time';

const isLive = (i: Item) => i.deletedAt === undefined;
const byOrder = (a: Item, b: Item) => a.order - b.order;

// ── Which view an item is in ──────────────────────────────────────────────────

/**
 * Today: everything unchecked that is due today or earlier (so overdue items
 * stay until done or moved), then what was checked off today.
 */
export function todayItems(items: Item[], kind: TimerState, today: string, win: DayWindow): Item[] {
  const open = items
    .filter((i) => isLive(i) && i.kind === kind && !i.done && i.dueOn !== null && i.dueOn <= today)
    .sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : a.dueOn! > b.dueOn! ? 1 : byOrder(a, b)));
  const done = items
    .filter(
      (i) =>
        isLive(i) &&
        i.kind === kind &&
        i.done &&
        i.doneAt !== undefined &&
        i.doneAt >= win.start &&
        i.doneAt < win.end
    )
    .sort((a, b) => a.doneAt! - b.doneAt!);
  return [...open, ...done];
}

/** Later: dated items after today in date order, then undated ("someday"). */
export function laterItems(items: Item[], kind: TimerState, today: string): Item[] {
  const later = items.filter(
    (i) => isLive(i) && i.kind === kind && !i.done && (i.dueOn === null || i.dueOn > today)
  );
  const dated = later
    .filter((i) => i.dueOn !== null)
    .sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : a.dueOn! > b.dueOn! ? 1 : byOrder(a, b)));
  const someday = later.filter((i) => i.dueOn === null).sort(byOrder);
  return [...dated, ...someday];
}

/** Days past due, or 0 when it isn't overdue. */
export function overdueDays(item: Item, today: string): number {
  if (item.done || item.dueOn === null || item.dueOn >= today) return 0;
  return daysBetween(item.dueOn, today);
}

// ── Changing items ────────────────────────────────────────────────────────────

function upsert(items: Item[], next: Item): Item[] {
  return items.some((i) => i.id === next.id)
    ? items.map((i) => (i.id === next.id ? next : i))
    : [...items, next];
}

export function nextOrder(items: Item[]): number {
  return items.reduce((m, i) => Math.max(m, i.order), 0) + 1;
}

export function makeItem(
  items: Item[],
  fields: { text: string; kind: TimerState; dueOn: string | null; repeat?: Recurrence },
  now: number
): Item {
  return {
    id: crypto.randomUUID(),
    text: fields.text,
    kind: fields.kind,
    // A repeating item needs a date to repeat from.
    dueOn: fields.dueOn,
    done: false,
    repeat: fields.repeat,
    order: nextOrder(items),
    updatedAt: now,
  };
}

/** The next occurrence of a repeating item. Its id is derived, so two devices agree. */
function occurrenceAfter(item: Item, today: string, now: number): Item | null {
  if (!item.repeat || item.dueOn === null) return null;
  const dueOn = nextDueKey(item.repeat, item.dueOn, today);
  const seriesId = item.seriesId ?? item.id;
  return {
    id: `${seriesId}:${dueOn}`,
    text: item.text,
    kind: item.kind,
    dueOn,
    done: false,
    repeat: item.repeat,
    seriesId,
    order: item.order,
    updatedAt: now,
  };
}

/** Check an item off, creating the next occurrence if it repeats. */
export function completeItem(items: Item[], id: string, today: string, now: number): Item[] {
  const item = items.find((i) => i.id === id);
  if (!item || item.done) return items;
  const next = occurrenceAfter(item, today, now);
  const done: Item = {
    ...item,
    done: true,
    doneAt: now,
    nextId: next?.id,
    seriesId: item.repeat ? (item.seriesId ?? item.id) : item.seriesId,
    updatedAt: now,
  };
  const out = items.map((i) => (i.id === id ? done : i));
  return next ? upsert(out, next) : out;
}

/** Uncheck an item, removing the occurrence it created if that is still untouched. */
export function uncompleteItem(items: Item[], id: string, now: number): Item[] {
  const item = items.find((i) => i.id === id);
  if (!item || !item.done) return items;
  return items.map((i) => {
    if (i.id === id) {
      return { ...i, done: false, doneAt: undefined, nextId: undefined, updatedAt: now };
    }
    if (i.id === item.nextId && !i.done && isLive(i)) {
      return { ...i, deletedAt: now, updatedAt: now };
    }
    return i;
  });
}

/** Drop this occurrence and bring the next one forward, for a repeating item. */
export function skipItem(items: Item[], id: string, today: string, now: number): Item[] {
  const item = items.find((i) => i.id === id);
  if (!item || item.done) return items;
  const next = occurrenceAfter(item, today, now);
  const out = items.map((i) => (i.id === id ? { ...i, deletedAt: now, updatedAt: now } : i));
  return next ? upsert(out, next) : out;
}

export function removeItem(items: Item[], id: string, now: number): Item[] {
  return items.map((i) => (i.id === id ? { ...i, deletedAt: now, updatedAt: now } : i));
}

export function updateItem(
  items: Item[],
  id: string,
  patch: Partial<Pick<Item, 'text' | 'kind' | 'dueOn' | 'repeat'>>,
  now: number
): Item[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now } : i));
}
