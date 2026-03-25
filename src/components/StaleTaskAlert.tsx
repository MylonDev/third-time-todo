import { useState } from 'react';
import { useTasks } from '../store/tasks';
import { todayKey, isStale, daysSince } from '../utils/thirdTime';

export function StaleTaskAlert() {
  const { tasks, updateTask, deleteTask } = useTasks();
  const [dismissed, setDismissed] = useState(false);

  const today = todayKey();
  const staleTasks = tasks.filter((t) => t.status !== 'done' && isStale(t.createdAt));

  if (staleTasks.length === 0 || dismissed) return null;

  return (
    <div
      className="rounded-2xl border p-4 flex flex-col gap-3"
      style={{
        background: 'var(--color-accent-dim)',
        borderColor: 'rgba(167,139,250,0.25)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--color-accent)' }} className="text-base leading-none">⚠</span>
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}
          >
            {staleTasks.length} task{staleTasks.length > 1 ? 's have' : ' has'} been waiting a while
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs transition-opacity opacity-50 hover:opacity-100"
          style={{ color: 'var(--color-accent)' }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {staleTasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1" style={{ color: 'var(--color-text)' }}>
              {t.title}
              <span
                className="ml-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-accent)' }}
              >
                {daysSince(t.createdAt)}d old
              </span>
            </span>
            <button
              onClick={() => updateTask(t.id, { scheduledDate: today })}
              className="px-2.5 py-1 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              Prioritize
            </button>
            <button
              onClick={() => deleteTask(t.id)}
              className="px-2.5 py-1 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
              }}
            >
              Discard
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
