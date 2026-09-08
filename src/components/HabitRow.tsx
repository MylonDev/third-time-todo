import { useState } from 'react';
import type { Habit } from '../types';
import { useHabits } from '../store/habits';
import { dateKey } from '../utils/goalPeriod';
import { isDoneOn } from '../utils/habit';
import { InlineInput } from './InlineInput';
import { ActionMenu } from './ActionMenu';
import { HabitAdherence } from './HabitAdherence';
import { freqLabel } from '../utils/habitFreq';

export function HabitRow({ habit, dimmed = false }: { habit: Habit; dimmed?: boolean }) {
  const toggleCompletion = useHabits((s) => s.toggleCompletion);
  const logAmount = useHabits((s) => s.logAmount);
  const updateHabit = useHabits((s) => s.updateHabit);
  const archiveHabit = useHabits((s) => s.archiveHabit);
  const restoreHabit = useHabits((s) => s.restoreHabit);
  const deleteHabit = useHabits((s) => s.deleteHabit);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(habit.name);

  const today = dateKey(new Date());
  const done = isDoneOn(habit, today);
  const archived = !!habit.archivedAt;
  const raw = habit.completions[today];
  const logged = typeof raw === 'number' ? raw : 0;

  const saveEdit = () => {
    const name = editName.trim();
    if (name) updateHabit(habit.id, { name });
    setEditing(false);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (archived || editing || habit.target) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
    toggleCompletion(habit.id);
  };

  const rowStyle: React.CSSProperties = done
    ? { background: 'var(--color-habit-dim)', borderColor: 'var(--color-habit-edge)' }
    : { background: 'var(--color-surface)', borderColor: 'var(--color-border)' };

  return (
    <li
      onClick={handleCardClick}
      className="flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors"
      style={{ ...rowStyle, opacity: dimmed ? 0.5 : 1, cursor: habit.target || archived ? 'default' : 'pointer' }}
    >
      {habit.target ? (
        <div
          className="flex items-center rounded-lg border overflow-hidden flex-shrink-0"
          style={{ borderColor: done ? 'var(--color-habit)' : 'var(--color-border)' }}
        >
          <button
            type="button"
            aria-label={`Log less for ${habit.name}`}
            className="px-2 py-1 text-sm"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            onClick={() => logAmount(habit.id, Math.max(0, logged - 1))}
          >
            −
          </button>
          <span
            className="num px-2 py-1 text-xs whitespace-nowrap"
            style={{ color: done ? 'var(--color-habit)' : 'var(--color-text)' }}
          >
            {logged}/{habit.target.amount} {habit.target.unit}
          </span>
          <button
            type="button"
            aria-label={`Log more for ${habit.name}`}
            className="px-2 py-1 text-sm"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            onClick={() => logAmount(habit.id, logged + 1)}
          >
            +
          </button>
        </div>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={habit.name}
          disabled={archived}
          onClick={() => toggleCompletion(habit.id)}
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `2px solid ${done ? 'var(--color-habit)' : 'var(--color-border-strong)'}`,
            background: done ? 'var(--color-habit)' : 'transparent',
            color: 'var(--color-bg)',
          }}
        >
          {done && (
            <svg width="11" height="9" viewBox="0 0 10 8" fill="none">
              <path
                d="M1 4L3.5 6.5L9 1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}

      <div className="flex flex-col gap-0.5 min-w-0">
        {editing ? (
          <InlineInput
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onCommit={saveEdit}
            onCancel={() => {
              setEditName(habit.name);
              setEditing(false);
            }}
            onBlur={saveEdit}
            className="text-sm"
          />
        ) : (
          <span
            className="text-sm font-medium truncate"
            style={{ color: done ? 'var(--color-text-muted)' : 'var(--color-text)' }}
          >
            {habit.name}
          </span>
        )}
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {freqLabel(habit.freq)}
        </span>
      </div>

      <div className="flex-1" />

      {!archived && <HabitAdherence habit={habit} />}

      {archived ? (
        <button
          type="button"
          onClick={() => restoreHabit(habit.id)}
          className="text-xs font-semibold flex-shrink-0"
          style={{ color: 'var(--color-accent)' }}
        >
          Restore
        </button>
      ) : (
        <ActionMenu
          label={`Actions for ${habit.name}`}
          actions={[
            {
              label: 'Edit name',
              onSelect: () => {
                setEditName(habit.name);
                setEditing(true);
              },
            },
            { label: 'Archive', onSelect: () => archiveHabit(habit.id) },
            { label: 'Delete', onSelect: () => deleteHabit(habit.id), danger: true },
          ]}
        />
      )}
    </li>
  );
}
