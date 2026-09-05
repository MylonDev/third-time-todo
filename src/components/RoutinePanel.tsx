import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTasks, usePendingRoutines } from '../store/tasks';
import { formatTimeLong } from '../utils/thirdTime';
import { useFocusable } from '../hooks/useFocusable';
import type { Routine, Task } from '../types';

function periodLabel(routine: Routine): string {
  if (routine.period === 'daily') return 'Daily';
  if (routine.period === 'weekly') return 'Weekly';
  return `Every ${routine.periodDays ?? 1}d`;
}

function Step({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const done = task.status === 'done';
  const { isFocused, tracking, segmentMs, toggleFocus } = useFocusable(
    { kind: 'task', id: task.id },
    !done
  );
  const live = (task.trackedMs ?? 0) + segmentMs;

  return (
    <li
      className="flex items-center gap-2.5 py-1 rounded-lg px-1 -mx-1 cursor-pointer"
      style={{ background: isFocused ? 'var(--color-accent-dim)' : 'transparent' }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        toggleFocus();
      }}
    >
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        className="flex-shrink-0 flex items-center justify-center transition-all"
        style={{
          width: '17px',
          height: '17px',
          borderRadius: '4px',
          border: `2px solid ${done ? 'var(--color-rest)' : 'var(--color-border-strong)'}`,
          background: done ? 'var(--color-rest)' : 'transparent',
          color: done ? 'var(--color-bg)' : 'transparent',
        }}
      >
        {done && (
          <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span
        className="text-[13px] flex-1 min-w-0 truncate"
        style={{
          color: done ? 'var(--color-text-muted)' : 'var(--color-text)',
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {task.title}
      </span>
      {live > 0 && (
        <span
          className="num text-[11px] flex-shrink-0"
          style={{ color: tracking ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
        >
          {formatTimeLong(live)}
        </span>
      )}
    </li>
  );
}

/**
 * One routine at a time. Which one you care about depends on the hour, so the
 * panel shows the first that still has something outstanding and drops it the
 * moment it is finished — the next one then takes its place on its own.
 */
export function RoutinePanel() {
  const { updateTask, snoozeRoutine } = useTasks();
  const [index, setIndex] = useState(0);
  const pending = usePendingRoutines();

  if (pending.length === 0) {
    return (
      <p className="text-sm py-1" style={{ color: 'var(--color-text-muted)' }}>
        Nothing outstanding — your routines come back next period.
      </p>
    );
  }

  // The list shrinks as routines are finished, so clamp rather than store.
  const cursor = Math.min(index, pending.length - 1);
  const current = pending[cursor];
  const { routine, steps } = current;
  const done = steps.filter((t) => t.status === 'done').length;

  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={routine.id}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        // Dashed, because this block regenerates — it is not a list you own,
        // it is one that comes back.
        className="rounded-2xl p-3.5 flex flex-col gap-2"
        style={{
          background: 'var(--color-surface-2)',
          border: '1px dashed var(--color-border-strong)',
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} aria-hidden="true">
            ↻
          </span>
          <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
            {routine.title}
          </h3>
          <span className="num text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {done}/{steps.length}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-semibold"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
          >
            {periodLabel(routine)}
          </span>

          <button
            onClick={() => snoozeRoutine(routine.id)}
            className="ml-auto text-xs transition-opacity opacity-60 hover:opacity-100 flex-shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            title="Clear this routine's remaining steps until its next turn"
          >
            Skip
          </button>
        </div>

        <ul className="flex flex-col">
          {steps.map((task) => (
            <Step
              key={task.id}
              task={task}
              onToggle={() =>
                updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })
              }
            />
          ))}
        </ul>

        {pending.length > 1 && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex gap-1.5">
              {pending.map((p, i) => (
                <button
                  key={p.routine.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Show ${p.routine.title}`}
                  aria-current={i === cursor}
                  className="rounded-full transition-all"
                  style={{
                    width: i === cursor ? '16px' : '6px',
                    height: '6px',
                    background:
                      i === cursor
                        ? 'var(--color-text-muted)'
                        : 'var(--color-border-strong)',
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] ml-auto" style={{ color: 'var(--color-text-muted)' }}>
              {pending.length - 1} more routine{pending.length - 1 === 1 ? '' : 's'} waiting
            </span>
          </div>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
