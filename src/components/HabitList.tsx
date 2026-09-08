import { useState } from 'react';
import { useHabits } from '../store/habits';
import { dateKey, isHabitOutstanding } from '../utils/goalPeriod';

/**
 * FOUNDATION STUB — the Habits thread owns this file and rebuilds it against
 * `design/redesign-mockups.html` (#habits): due-today filter + "show all",
 * last-7-days dots, weekday-picker add form, per-occurrence targets, adherence.
 * This version just lists habits with a checkbox so the tab is usable.
 */
export function HabitList() {
  const habits = useHabits((s) => s.habits);
  const addHabit = useHabits((s) => s.addHabit);
  const toggleCompletion = useHabits((s) => s.toggleCompletion);
  const [title, setTitle] = useState('');
  const [showAll, setShowAll] = useState(false);

  const today = dateKey(new Date());
  const active = habits.filter((h) => !h.archivedAt).sort((a, b) => a.order - b.order);
  const shown = showAll ? active : active.filter((h) => isHabitOutstanding(h) || h.completions[today]);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = title.trim();
          if (!name) return;
          addHabit({ name, freq: { kind: 'daily' } });
          setTitle('');
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a habit…"
          className="flex-1 rounded-xl px-3 py-2 text-sm border outline-none"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
        />
        <button
          type="submit"
          className="px-4 rounded-xl text-sm font-semibold border"
          style={{
            background: 'var(--color-habit-dim)',
            color: 'var(--color-habit)',
            borderColor: 'var(--color-habit)',
          }}
        >
          Add
        </button>
      </form>

      {active.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
          No habits yet — add one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((h) => {
            const done = !!h.completions[today];
            return (
              <li key={h.id}>
                <button
                  onClick={() => toggleCompletion(h.id)}
                  className="w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-xs"
                    style={{
                      background: done ? 'var(--color-habit)' : 'transparent',
                      border: `1.5px solid ${done ? 'var(--color-habit)' : 'var(--color-border-strong)'}`,
                      color: 'var(--color-bg)',
                    }}
                  >
                    {done ? '✓' : ''}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: done ? 'var(--color-text-muted)' : 'var(--color-text)' }}
                  >
                    {h.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active.length > shown.length || showAll ? (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {showAll ? 'Show only what’s due' : `Show all ${active.length} habits`}
        </button>
      ) : null}
    </div>
  );
}
