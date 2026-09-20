import type { Habit } from '../types';
import { dateKey, getWeekKey, isHabitDueOn, lastNDays } from './goalPeriod';

export type DotState = 'done' | 'missed' | 'off';

/** Whether the habit counts as completed on a given day key. */
export function isDoneOn(habit: Habit, key: string): boolean {
  const v = habit.completions[key];
  if (v === true) return true;
  if (typeof v === 'number') {
    return habit.target ? v >= habit.target.amount : v > 0;
  }
  return false;
}

/**
 * The row's readout: one state per calendar day for the last `n` days, oldest
 * first. `off` = the habit wasn't due that day; `done` / `missed` otherwise.
 * A weekly habit reads a day as `done` if it was completed anywhere that week.
 */
export function dotStates(
  habit: Habit,
  dayEndHour: number,
  n = 7,
  end: Date = new Date()
): DotState[] {
  const createdKey = dateKey(new Date(habit.createdAt));
  return lastNDays(n, end).map((key) => {
    // Days before the habit existed were never "missed".
    if (key < createdKey) return 'off';
    const day = new Date(key + 'T00:00:00');
    if (habit.freq.kind === 'weekly') {
      const weekStart = getWeekKey(day, dayEndHour);
      const nextWeek = new Date(weekStart + 'T00:00:00');
      nextWeek.setDate(nextWeek.getDate() + 7);
      const doneThisWeek = Object.keys(habit.completions).some(
        (k) => k >= weekStart && k < dateKey(nextWeek) && isDoneOn(habit, k)
      );
      // Mark only the last day of a past week, so the row shows ~1 dot per week.
      const isWeekEnd = weekdayOf(day) === 6 || key === dateKey(end);
      if (!isWeekEnd) return 'off';
      return doneThisWeek ? 'done' : 'missed';
    }
    if (!isHabitDueOn(habit, day)) return 'off';
    return isDoneOn(habit, key) ? 'done' : 'missed';
  });
}

function weekdayOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Completed vs due over a trailing window of `windowDays` calendar days. */
export function adherence(
  habit: Habit,
  dayEndHour: number,
  windowDays = 14,
  end: Date = new Date()
): { done: number; due: number; pct: number } {
  const createdKey = dateKey(new Date(habit.createdAt));
  let done = 0;
  let due = 0;
  for (const key of lastNDays(windowDays, end)) {
    if (key < createdKey) continue;
    const day = new Date(key + 'T00:00:00');
    if (habit.freq.kind === 'weekly') continue; // handled below
    if (!isHabitDueOn(habit, day)) continue;
    due += 1;
    if (isDoneOn(habit, key)) done += 1;
  }
  if (habit.freq.kind === 'weekly') {
    const weeks = new Set(
      lastNDays(windowDays, end)
        .filter((k) => k >= createdKey)
        .map((k) => getWeekKey(new Date(k + 'T00:00:00'), dayEndHour))
    );
    for (const weekStart of weeks) {
      due += 1;
      const nextWeek = new Date(weekStart + 'T00:00:00');
      nextWeek.setDate(nextWeek.getDate() + 7);
      const hit = Object.keys(habit.completions).some(
        (k) => k >= weekStart && k < dateKey(nextWeek) && isDoneOn(habit, k)
      );
      if (hit) done += 1;
    }
  }
  return { done, due, pct: due > 0 ? done / due : 0 };
}
