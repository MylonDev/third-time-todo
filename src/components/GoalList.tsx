import { useState } from 'react';
import { useGoals } from '../store/goals';
import { useFocusable } from '../hooks/useFocusable';
import { cumulativeTotal, formatGoalTotal, isGoalMet, outcomeProgress } from '../utils/goal';
import type { Goal } from '../types';

/**
 * FOUNDATION STUB — the Goals thread owns this file and rebuilds it against
 * `design/redesign-mockups.html` (#goals-list, #goals-new, #goals-evolve):
 * measure-aware cards (Time / Count / Open), milestone dots, effort-target vs
 * per-period progress, deadline pace, the add form, evolve dialog, archive view.
 * This version lists goals with a progress bar, click-to-focus and +/- logging.
 */

function GoalRow({ goal }: { goal: Goal }) {
  const { isFocused, toggleFocus } = useFocusable({ kind: 'goal', id: goal.id });
  const logCount = useGoals((s) => s.logCount);
  const met = isGoalMet(goal);
  const frac = outcomeProgress(goal);

  return (
    <li
      className="rounded-2xl border p-4 flex flex-col gap-2.5 cursor-pointer"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        toggleFocus();
      }}
      style={{
        background: isFocused ? 'var(--color-accent-dim)' : 'var(--color-surface)',
        borderColor: isFocused ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
            {goal.title}
          </span>
          {goal.doneWhen && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Done when · {goal.doneWhen}
            </span>
          )}
        </div>
        <span className="num text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {formatGoalTotal(goal)}
        </span>
      </div>

      {frac != null && (
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: 'var(--color-surface-2)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, frac * 100)}%`,
              background: met ? 'var(--color-rest)' : 'var(--color-accent)',
            }}
          />
        </div>
      )}

      {goal.outcome.kind === 'count' && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => logCount(goal.id, -1)}
            className="w-7 h-7 rounded-lg border text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            −
          </button>
          <span className="num text-sm">
            {Math.round(cumulativeTotal(goal))} / {goal.outcome.target} {goal.outcome.unit}
          </span>
          <button
            onClick={() => logCount(goal.id, 1)}
            className="w-7 h-7 rounded-lg border text-sm"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          >
            +
          </button>
        </div>
      )}

      {goal.milestones.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {goal.milestones.map((m) => (
            <MilestoneChip key={m.id} goalId={goal.id} milestoneId={m.id} label={m.label} done={!!m.doneAt} />
          ))}
        </div>
      )}
    </li>
  );
}

function MilestoneChip({
  goalId,
  milestoneId,
  label,
  done,
}: {
  goalId: string;
  milestoneId: string;
  label: string;
  done: boolean;
}) {
  const toggleMilestone = useGoals((s) => s.toggleMilestone);
  return (
    <button
      onClick={() => toggleMilestone(goalId, milestoneId)}
      className="flex items-center gap-1.5 text-xs"
      style={{ color: done ? 'var(--color-text-muted)' : 'var(--color-text)' }}
    >
      <span
        className="w-4 h-4 rounded flex items-center justify-center"
        style={{
          background: done ? 'var(--color-rest)' : 'transparent',
          border: `1px solid ${done ? 'var(--color-rest)' : 'var(--color-border-strong)'}`,
          color: 'var(--color-bg)',
        }}
      >
        {done ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}

export function GoalList() {
  const goals = useGoals((s) => s.goals);
  const [showArchived, setShowArchived] = useState(false);
  const active = goals.filter((g) => !g.archivedAt).sort((a, b) => a.order - b.order);
  const archived = goals.filter((g) => g.archivedAt);

  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
          No goals yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((g) => (
            <GoalRow key={g.id} goal={g} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="self-start text-xs font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {showArchived ? 'Hide' : `${archived.length} archived`}
        </button>
      )}
      {showArchived &&
        archived.map((g) => (
          <div key={g.id} className="text-sm px-1" style={{ color: 'var(--color-text-muted)' }}>
            {g.title}
          </div>
        ))}
    </div>
  );
}
