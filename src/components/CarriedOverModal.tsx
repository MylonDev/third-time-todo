import { useState } from 'react';
import { Modal } from './Modal';
import { useTasks } from '../store/tasks';
import type { Task, TaskDisposition } from '../types';

const LABELS: Record<TaskDisposition, string> = {
  keep: 'Keep',
  'mark-done': 'Done',
  discard: 'Discard',
};

const COLORS: Record<TaskDisposition, { bg: string; text: string }> = {
  keep: { bg: 'var(--color-accent-dim)', text: 'var(--color-accent)' },
  'mark-done': { bg: 'var(--color-rest-dim)', text: 'var(--color-rest)' },
  discard: { bg: 'var(--color-debt-dim)', text: 'var(--color-debt)' },
};

const ORDER: TaskDisposition[] = ['keep', 'mark-done', 'discard'];

/**
 * Shown once, on the open that actually carries tasks over from a previous
 * day. This used to sit inside the end-of-day flow, which now runs several
 * times a day — and deciding what to drop is a better question in the morning
 * than at the end of a session anyway.
 *
 * Keeping them has already happened by the time this appears, so dismissing it
 * is a valid answer.
 */
export function CarriedOverModal({ taskIds, onClose }: { taskIds: string[]; onClose: () => void }) {
  const { tasks, updateTask, deleteTask } = useTasks();
  const [dispositions, setDispositions] = useState<Record<string, TaskDisposition>>(() =>
    Object.fromEntries(taskIds.map((id) => [id, 'keep' as TaskDisposition]))
  );

  const carried = taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  if (carried.length === 0) return null;

  const apply = () => {
    carried.forEach((task) => {
      const d = dispositions[task.id];
      if (d === 'mark-done') updateTask(task.id, { status: 'done' });
      else if (d === 'discard') deleteTask(task.id);
    });
    onClose();
  };

  return (
    <Modal onClose={onClose} label="Tasks carried over" size="md" className="gap-5 p-6">
      <div>
        <h2
          className="text-lg font-bold"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
        >
          {carried.length === 1 ? 'One task' : `${carried.length} tasks`} came with you
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Unfinished from a previous day, and already on today's list. Drop
          anything you are not going to do.
        </p>
      </div>

      <ul className="flex flex-col gap-3 max-h-64 overflow-y-auto">
        {carried.map((task) => (
          <li key={task.id} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {task.title}
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {ORDER.map((d) => {
                const selected = dispositions[task.id] === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDispositions((prev) => ({ ...prev, [task.id]: d }))}
                    aria-pressed={selected}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                    style={
                      selected
                        ? {
                            background: COLORS[d].bg,
                            color: COLORS[d].text,
                            borderColor: COLORS[d].text,
                          }
                        : {
                            background: 'transparent',
                            color: 'var(--color-text-muted)',
                            borderColor: 'var(--color-border)',
                          }
                    }
                  >
                    {LABELS[d]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={apply}
        className="py-2.5 rounded-xl font-semibold text-sm transition-colors"
        style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
      >
        Start the day
      </button>
    </Modal>
  );
}
