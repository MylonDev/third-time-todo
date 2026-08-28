import { useState } from 'react';
import { useTasks } from '../store/tasks';
import { useSettings } from '../store/settings';
import { todayKey, isStale, daysSince } from '../utils/thirdTime';

const MAX_SHOWN = 3;

export function StaleTaskAlert() {
  const { tasks, prioritizeTask, deleteTask } = useTasks();
  const { staleAlertDismissedOn, setStaleAlertDismissedOn } = useSettings();
  const [expanded, setExpanded] = useState(false);

  const today = todayKey();

  // Only today's list, and only tasks the user has not already acted on —
  // prioritising a task restarts its clock via `acknowledgedAt`.
  const staleTasks = tasks.filter(
    (t) =>
      t.status !== 'done' &&
      t.scheduledDate === today &&
      isStale(t.acknowledgedAt ?? t.createdAt)
  );

  if (staleTasks.length === 0 || staleAlertDismissedOn === today) return null;

  const shown = expanded ? staleTasks : staleTasks.slice(0, MAX_SHOWN);
  const hidden = staleTasks.length - shown.length;

  return (
    <div
      className="rounded-2xl border p-4 flex flex-col gap-3"
      style={{
        background: 'var(--color-accent-dim)',
        borderColor: 'rgba(167,139,250,0.25)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
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
          onClick={() => setStaleAlertDismissedOn(today)}
          className="text-xs transition-opacity opacity-60 hover:opacity-100 flex-shrink-0"
          style={{ color: 'var(--color-accent)' }}
          aria-label="Dismiss for today"
          title="Dismiss for today"
        >
          ✕
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {shown.map((t) => (
          <li key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
            <span className="flex-1 min-w-0" style={{ color: 'var(--color-text)' }}>
              {t.title}
              <span className="ml-2 text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                <span className="num">{daysSince(t.acknowledgedAt ?? t.createdAt)}d</span> old
              </span>
            </span>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => prioritizeTask(t.id)}
                className="px-2.5 py-1 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
                title="Move to the top of today's list"
              >
                Do it first
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
            </div>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs self-start transition-opacity opacity-70 hover:opacity-100"
          style={{ color: 'var(--color-accent)' }}
        >
          Show {hidden} more
        </button>
      )}
    </div>
  );
}
