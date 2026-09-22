import { describe, expect, it } from 'vitest';
import { occursOn, overdueTasks, scheduleDays } from './schedule';
import type { RecurringTask, Task } from '../types';

// Wednesday 23 September 2026.
const WED = new Date(2026, 8, 23, 12).getTime();

function rule(overrides: Partial<RecurringTask>): RecurringTask {
  return { id: 'r', title: 'R', rule: { kind: 'daily' }, createdAt: WED, order: 0, completions: {}, ...overrides };
}

describe('scheduleDays', () => {
  it('This week is Monday to Sunday', () => {
    expect(scheduleDays('week', '2026-09-23', 0)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
    ]);
  });

  it('Rolling starts today', () => {
    expect(scheduleDays('rolling', '2026-09-27', 0)[0]).toBe('2026-09-27');
    expect(scheduleDays('rolling', '2026-09-27', 0)[6]).toBe('2026-10-03');
  });
});

describe('occursOn', () => {
  it('never before its anchor day', () => {
    expect(occursOn(rule({}), '2026-09-22', 0)).toBe(false);
    expect(occursOn(rule({}), '2026-09-23', 0)).toBe(true);
  });

  it('weekly repeats on the anchor’s weekday', () => {
    const r = rule({ rule: { kind: 'weekly' } });
    expect(occursOn(r, '2026-09-30', 0)).toBe(true);
    expect(occursOn(r, '2026-09-24', 0)).toBe(false);
  });

  it('weekdays follows the chosen days', () => {
    const r = rule({ rule: { kind: 'weekdays', days: [0, 2] } }); // Mon, Wed
    expect(occursOn(r, '2026-09-28', 0)).toBe(true);
    expect(occursOn(r, '2026-09-29', 0)).toBe(false);
  });

  it('everyN counts from the anchor day', () => {
    const r = rule({ rule: { kind: 'everyN', n: 3 } });
    expect(occursOn(r, '2026-09-26', 0)).toBe(true);
    expect(occursOn(r, '2026-09-25', 0)).toBe(false);
  });

  it('a skipped date is skipped, the next one stands', () => {
    const r = rule({ skipped: { '2026-09-24': true } });
    expect(occursOn(r, '2026-09-24', 0)).toBe(false);
    expect(occursOn(r, '2026-09-25', 0)).toBe(true);
  });

  it('stops after the day it was ended, keeping that day', () => {
    const r = rule({ endedAt: new Date(2026, 8, 25, 9).getTime() });
    expect(occursOn(r, '2026-09-25', 0)).toBe(true);
    expect(occursOn(r, '2026-09-26', 0)).toBe(false);
  });
});

describe('overdueTasks', () => {
  const t = (id: string, scheduledDate: string, status: 'todo' | 'done' = 'todo'): Task => ({
    id, title: id, status, createdAt: 0, scheduledDate, order: 0, subtasks: [], trackedMs: 0,
  });

  it('is the undone one-offs from past days, oldest first', () => {
    const list = overdueTasks(
      [t('today', '2026-09-23'), t('done', '2026-09-20', 'done'), t('b', '2026-09-22'), t('a', '2026-09-19')],
      '2026-09-23'
    );
    expect(list.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
