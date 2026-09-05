import { useState } from 'react';
import { InlineInput } from './InlineInput';
import { Modal } from './Modal';
import { useTasks } from '../store/tasks';
import type { GoalPeriod, Routine } from '../types';

const PERIODS: GoalPeriod[] = ['daily', 'weekly', 'custom'];

function periodLabel(period: GoalPeriod, periodDays?: number): string {
  if (period === 'daily') return 'Every day';
  if (period === 'weekly') return 'Every week';
  return `Every ${periodDays ?? 1} days`;
}

const segBtn = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
  color: active ? 'var(--color-on-accent)' : 'var(--color-text-muted)',
  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
});

function RoutineEditor({ routine }: { routine: Routine }) {
  const {
    updateRoutine, deleteRoutine, addRoutineItem, updateRoutineItem, deleteRoutineItem,
  } = useTasks();
  const [newItem, setNewItem] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(routine.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveTitle = () => {
    if (title.trim()) updateRoutine(routine.id, { title: title.trim() });
    else setTitle(routine.title);
    setEditingTitle(false);
  };

  return (
    <li
      className="rounded-xl border p-3 flex flex-col gap-2.5"
      style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-start gap-2">
        {editingTitle ? (
          <InlineInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onCommit={saveTitle}
            onCancel={() => { setTitle(routine.title); setEditingTitle(false); }}
            className="flex-1 text-[15px] font-semibold"
            style={{ background: 'var(--color-surface)' }}
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="flex-1 text-left text-[15px] font-semibold"
            style={{ color: 'var(--color-text)' }}
            title="Rename"
          >
            {routine.title}
          </button>
        )}
        <button
          onClick={() => (confirmDelete ? deleteRoutine(routine.id) : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
          className="text-xs font-semibold px-2 py-1 rounded-lg flex-shrink-0"
          style={{
            color: 'var(--color-debt)',
            background: confirmDelete ? 'var(--color-debt-dim)' : 'transparent',
          }}
        >
          {confirmDelete ? 'Really delete?' : 'Delete'}
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap items-center">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => updateRoutine(routine.id, { period: p, periodDays: p === 'custom' ? routine.periodDays ?? 7 : undefined })}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={segBtn(routine.period === p)}
          >
            {p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : 'Custom'}
          </button>
        ))}
        {routine.period === 'custom' && (
          <span className="flex items-center gap-1">
            <input
              type="number"
              min="2"
              value={routine.periodDays ?? 7}
              onChange={(e) => updateRoutine(routine.id, { periodDays: Math.max(2, Number(e.target.value) || 7) })}
              className="w-14 rounded-lg px-2 py-1 text-xs outline-none border"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              aria-label="Days between repeats"
            />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>days</span>
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {routine.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 group">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>•</span>
            <input
              value={item.title}
              onChange={(e) => updateRoutineItem(routine.id, item.id, e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none rounded px-1 py-0.5"
              style={{ color: 'var(--color-text)' }}
              aria-label={`Rename ${item.title}`}
            />
            <button
              onClick={() => deleteRoutineItem(routine.id, item.id)}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 focus-visible:opacity-100 transition-opacity text-xs"
              style={{ color: 'var(--color-debt)' }}
              aria-label={`Remove ${item.title}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <input
        value={newItem}
        onChange={(e) => setNewItem(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && newItem.trim()) {
            addRoutineItem(routine.id, newItem.trim());
            setNewItem('');
          }
        }}
        placeholder="Add a step… (Enter to save)"
        className="w-full text-sm bg-transparent outline-none border-b border-dashed py-1"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      />

      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {periodLabel(routine.period, routine.periodDays)} · {routine.items.length} step
        {routine.items.length === 1 ? '' : 's'} added to your task list
      </p>
    </li>
  );
}

export function RoutinesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { routines, addRoutine, spawnDueRoutines } = useTasks();
  const [newTitle, setNewTitle] = useState('');

  if (!isOpen) return null;

  const sorted = [...routines].sort((a, b) => a.order - b.order);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    addRoutine(newTitle.trim(), 'daily');
    setNewTitle('');
  };

  const handleClose = () => {
    // Pick up anything that became due while the routine was being edited.
    spawnDueRoutines();
    onClose();
  };

  return (
    <Modal onClose={handleClose} label="Routines" size="lg" className="max-h-[85vh]">
        <div
          className="flex items-start justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div>
            <h2
              className="text-base font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
            >
              Routines
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Steps you repeat. They land in your task list each period, grouped
              under the routine's name.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-xl leading-none transition-opacity opacity-40 hover:opacity-100"
            style={{ color: 'var(--color-text)' }}
            aria-label="Close routines"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {sorted.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No routines yet. Add one below — a morning start-up, a weekly review,
              anything you do on a cycle.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {sorted.map((r) => (
              <RoutineEditor key={r.id} routine={r} />
            ))}
          </ul>
        </div>

        <form
          onSubmit={handleAdd}
          className="flex gap-2 px-5 py-4 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New routine name…"
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none border"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Add
          </button>
        </form>
    </Modal>
  );
}
