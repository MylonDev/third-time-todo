import { useMemo, useState } from 'react';
import { useHabits } from '../store/habits';
import { dateKey, weekdayIndex, isHabitOutstanding } from '../utils/goalPeriod';
import { isDoneOn } from '../utils/habit';
import { HabitRow } from './HabitRow';
import { HabitAddForm } from './HabitAddForm';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function HabitList() {
  const habits = useHabits((s) => s.habits);
  const addHabit = useHabits((s) => s.addHabit);

  const [showAll, setShowAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const now = new Date();
  const today = dateKey(now);

  const active = useMemo(
    () => habits.filter((h) => !h.archivedAt).sort((a, b) => a.order - b.order),
    [habits]
  );
  const archived = useMemo(
    () =>
      habits
        .filter((h) => h.archivedAt)
        .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    [habits]
  );

  // Due-today set: still outstanding, or touched today at all (a ticked habit
  // stays visible for the rest of the day; a partially-logged target too).
  const isDue = (h: (typeof active)[number]) =>
    isHabitOutstanding(h) || h.completions[today] != null;
  const due = active.filter(isDue);
  const rest = active.filter((h) => !isDue(h));
  const doneCount = due.filter((h) => isDoneOn(h, today)).length;

  const dayLabel = `${WEEKDAYS[weekdayIndex(now)]} ${now.getDate()}`;

  if (active.length === 0 && archived.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <HabitAddForm onAdd={addHabit} />
        <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          No habits yet — add one above.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HabitAddForm onAdd={addHabit} />

      <div className="flex items-center justify-between px-1">
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Due today · {dayLabel}
        </span>
        <span className="num text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {doneCount} / {due.length} done
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {due.length === 0 && (
          <li className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
            Nothing due today.
          </li>
        )}
        {due.map((h) => (
          <HabitRow key={h.id} habit={h} />
        ))}
        {showAll && rest.map((h) => <HabitRow key={h.id} habit={h} dimmed />)}
      </ul>

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {showAll ? "Show only what's due" : `Show all ${active.length} habits`}
        </button>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="self-start text-xs font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showArchived ? '▾' : '▸'} {archived.length} archived{' '}
            {archived.length === 1 ? 'habit' : 'habits'}
          </button>
          {showArchived && (
            <ul className="flex flex-col gap-2">
              {archived.map((h) => (
                <HabitRow key={h.id} habit={h} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
