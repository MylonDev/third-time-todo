import { describe, expect, it } from 'vitest';
import type { Item } from '../types';
import {
  completeItem,
  laterItems,
  makeItem,
  overdueDays,
  removeItem,
  skipItem,
  todayItems,
  uncompleteItem,
} from './items';
import { windowOf } from './time';

const TODAY = '2026-10-12'; // a Monday
const win = windowOf(TODAY, 0);
const NOW = new Date(2026, 9, 12, 10, 0).getTime();

function add(
  items: Item[],
  text: string,
  kind: 'should' | 'want',
  dueOn: string | null,
  repeat?: Item['repeat']
): Item[] {
  return [...items, makeItem(items, { text, kind, dueOn, repeat }, NOW)];
}
const texts = (items: Item[]) => items.map((i) => i.text);

describe('which view an item is in', () => {
  it('today holds items due today or earlier, overdue first', () => {
    let items = add([], 'today', 'should', TODAY);
    items = add(items, 'late', 'should', '2026-10-09');
    items = add(items, 'tomorrow', 'should', '2026-10-13');
    items = add(items, 'someday', 'should', null);
    items = add(items, 'a want', 'want', TODAY);
    expect(texts(todayItems(items, 'should', TODAY, win))).toEqual(['late', 'today']);
    expect(texts(todayItems(items, 'want', TODAY, win))).toEqual(['a want']);
  });

  it('later holds future items by date, then someday', () => {
    let items = add([], 'someday', 'should', null);
    items = add(items, 'next week', 'should', '2026-10-19');
    items = add(items, 'tomorrow', 'should', '2026-10-13');
    items = add(items, 'today', 'should', TODAY);
    expect(texts(laterItems(items, 'should', TODAY))).toEqual(['tomorrow', 'next week', 'someday']);
  });

  it('keeps items checked off today in today, and not the ones from before', () => {
    let items = add([], 'done now', 'should', TODAY);
    items = completeItem(items, items[0].id, TODAY, NOW);
    items = add(items, 'done last week', 'should', '2026-10-05');
    items = completeItem(items, items[1].id, TODAY, new Date(2026, 9, 5, 9).getTime());
    expect(texts(todayItems(items, 'should', TODAY, win))).toEqual(['done now']);
  });

  it('hides removed items', () => {
    let items = add([], 'gone', 'should', TODAY);
    items = removeItem(items, items[0].id, NOW);
    expect(todayItems(items, 'should', TODAY, win)).toEqual([]);
  });

  it('counts days overdue', () => {
    const items = add([], 'late', 'should', '2026-10-09');
    expect(overdueDays(items[0], TODAY)).toBe(3);
    expect(overdueDays(add([], 'on time', 'should', TODAY)[0], TODAY)).toBe(0);
  });
});

describe('completing', () => {
  it('checks an item off without creating anything', () => {
    const items = completeItem(add([], 'a', 'should', TODAY), add([], 'a', 'should', TODAY)[0].id, TODAY, NOW);
    expect(items).toHaveLength(1);
  });

  it('a repeating item creates its next occurrence', () => {
    let items = add([], 'water plants', 'want', TODAY, { kind: 'daily' });
    items = completeItem(items, items[0].id, TODAY, NOW);
    expect(items).toHaveLength(2);
    const next = items[1];
    expect(next.dueOn).toBe('2026-10-13');
    expect(next.done).toBe(false);
    expect(next.kind).toBe('want');
    expect(items[0].nextId).toBe(next.id);
  });

  it('completing the same item twice does not create two occurrences', () => {
    let items = add([], 'a', 'should', TODAY, { kind: 'daily' });
    const id = items[0].id;
    items = completeItem(items, id, TODAY, NOW);
    items = completeItem(items, id, TODAY, NOW + 1);
    expect(items).toHaveLength(2);
  });

  it('an overdue repeating item leaves one occurrence, not a backlog', () => {
    let items = add([], 'a', 'should', '2026-10-05', { kind: 'daily' });
    items = completeItem(items, items[0].id, TODAY, NOW);
    expect(items[1].dueOn).toBe('2026-10-13');
  });

  it('derives the same occurrence id wherever it is created', () => {
    const base = add([], 'a', 'should', TODAY, { kind: 'daily' });
    const one = completeItem(base, base[0].id, TODAY, NOW);
    const two = completeItem(base, base[0].id, TODAY, NOW + 5000);
    expect(one[1].id).toBe(two[1].id);
  });

  it('unchecking removes the occurrence it created', () => {
    let items = add([], 'a', 'should', TODAY, { kind: 'daily' });
    const id = items[0].id;
    items = completeItem(items, id, TODAY, NOW);
    items = uncompleteItem(items, id, NOW + 1);
    expect(items[0].done).toBe(false);
    expect(items[1].deletedAt).toBeDefined();
    // Completing again revives it.
    items = completeItem(items, id, TODAY, NOW + 2);
    expect(items).toHaveLength(2);
    expect(items[1].deletedAt).toBeUndefined();
  });

  it('unchecking keeps an occurrence that has already been done', () => {
    let items = add([], 'a', 'should', TODAY, { kind: 'daily' });
    const id = items[0].id;
    items = completeItem(items, id, TODAY, NOW);
    items = completeItem(items, items[1].id, '2026-10-13', NOW + 1);
    items = uncompleteItem(items, id, NOW + 2);
    expect(items[1].done).toBe(true);
    expect(items[1].deletedAt).toBeUndefined();
  });
});

describe('skipping', () => {
  it('drops this occurrence and brings the next one', () => {
    let items = add([], 'a', 'should', TODAY, { kind: 'weekly' });
    items = skipItem(items, items[0].id, TODAY, NOW);
    expect(items[0].deletedAt).toBeDefined();
    expect(items[1].dueOn).toBe('2026-10-19');
  });
});
