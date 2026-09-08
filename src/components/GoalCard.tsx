import { useFocusable } from '../hooks/useFocusable';
import { useGoals } from '../store/goals';
import { ActionMenu } from './ActionMenu';
import type { Goal } from '../types';
import {
  cumulativeTotal,
  effortReading,
  formatGoalTotal,
  formatOutcomeTarget,
  isGoalMet,
  lineageChain,
  measureLabel,
  outcomeProgress,
  paceReading,
  widthPct,
} from '../utils/goal';
import { formatDuration } from '../utils/thirdTime';

function Bar({ pct, met }: { pct: number; met?: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--color-surface-2)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: met ? 'var(--color-rest)' : 'var(--color-accent)',
        }}
      />
    </div>
  );
}

export function GoalCard({
  goal,
  onEdit,
  onReview,
}: {
  goal: Goal;
  onEdit: () => void;
  onReview: () => void;
}) {
  const focusable = goal.outcome.kind !== 'count';
  const { isFocused, tracking, toggleFocus } = useFocusable({ kind: 'goal', id: goal.id }, focusable);
  const logCount = useGoals((s) => s.logCount);
  const archiveGoal = useGoals((s) => s.archiveGoal);
  const deleteGoal = useGoals((s) => s.deleteGoal);
  const toggleMilestone = useGoals((s) => s.toggleMilestone);
  const goals = useGoals((s) => s.goals);

  const met = isGoalMet(goal);
  const outcomeFrac = outcomeProgress(goal);
  const effort = effortReading(goal);
  const pace = paceReading(goal);
  const target = formatOutcomeTarget(goal);
  const chain = lineageChain(goals, goal.id);
  const bankedMs = goal.outcome.kind === 'time' ? cumulativeTotal(goal) : null;

  const milestoneFrac =
    goal.milestones.length > 0
      ? goal.milestones.filter((m) => m.doneAt).length / goal.milestones.length
      : null;

  const contextBits: string[] = [];
  if (goal.doneWhen) contextBits.push(`Done when · ${goal.doneWhen}`);
  else if (target) contextBits.push(`Target · ${target}`);
  if (goal.outcome.kind !== 'time' && bankedMs === null) {
    const t = cumulativeTotal(goal);
    // Only meaningful when a time effort target has banked minutes.
    if (goal.effort?.metric === 'time' && t > 0) contextBits.push(`${formatDuration(t)} invested`);
  }

  const onCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a, select')) return;
    if (focusable) toggleFocus();
  };

  return (
    <li
      onClick={onCardClick}
      className="flex flex-col gap-3 rounded-2xl border p-4"
      style={{
        background: isFocused ? 'var(--color-accent-dim)' : 'var(--color-surface)',
        borderColor: isFocused ? 'var(--color-accent)' : 'var(--color-border)',
        cursor: focusable ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isFocused && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
              >
                {tracking ? 'Focusing' : 'Focused'}
              </span>
            )}
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
            >
              {measureLabel(goal.outcome)}
            </span>
            {met && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ background: 'var(--color-rest-dim)', color: 'var(--color-rest)' }}
              >
                Met
              </span>
            )}
          </div>
          <span className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
            {goal.title}
          </span>
          {contextBits.map((b) => (
            <span key={b} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {b}
            </span>
          ))}
          {chain.length > 1 && (
            <span className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {chain.map((g, i) => (
                <span key={g.id} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden>→</span>}
                  <span style={{ color: g.id === goal.id ? 'var(--color-text)' : undefined }}>{g.title}</span>
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="flex items-start gap-1">
          {(goal.outcome.kind !== 'open' || goal.milestones.length > 0) && (
            <div className="flex flex-col items-end">
              <span className="num text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                {goal.outcome.kind === 'count'
                  ? `${Math.round(cumulativeTotal(goal))} / ${goal.outcome.target}`
                  : goal.outcome.kind === 'time'
                  ? `${formatGoalTotal(goal)}${target ? ` / ${target}` : ''}`
                  : `${goal.milestones.filter((m) => m.doneAt).length} / ${goal.milestones.length}`}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {goal.outcome.kind === 'count'
                  ? goal.outcome.unit
                  : goal.outcome.kind === 'time'
                  ? 'focus time banked'
                  : 'milestones'}
              </span>
            </div>
          )}
          <ActionMenu
            label="Goal actions"
            actions={[
              { label: 'Edit', onSelect: onEdit },
              { label: 'Archive', onSelect: () => archiveGoal(goal.id) },
              { label: 'Delete', onSelect: () => deleteGoal(goal.id), danger: true },
            ]}
          />
        </div>
      </div>

      {goal.milestones.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {goal.milestones.map((m) => (
            <button
              key={m.id}
              onClick={() => toggleMilestone(goal.id, m.id)}
              className="flex items-center gap-1.5 text-xs"
              style={{ color: m.doneAt ? 'var(--color-text-muted)' : 'var(--color-text)' }}
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded text-[10px]"
                style={{
                  background: m.doneAt ? 'var(--color-rest)' : 'transparent',
                  border: `1px solid ${m.doneAt ? 'var(--color-rest)' : 'var(--color-border-strong)'}`,
                  color: 'var(--color-bg)',
                }}
              >
                {m.doneAt ? '✓' : ''}
              </span>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {outcomeFrac != null ? (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            <span>{formatGoalTotal(goal)}</span>
            <span className="num">{Math.round(widthPct(outcomeFrac))}%</span>
          </div>
          <Bar pct={widthPct(outcomeFrac)} met={met} />
        </div>
      ) : milestoneFrac != null ? (
        <Bar pct={widthPct(milestoneFrac)} met={met} />
      ) : null}

      {effort && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {effort.text}
            </span>
            {(goal.effort?.metric === 'count' || goal.outcome.kind === 'count') && (
              <span className="flex items-center gap-1.5">
                <button
                  onClick={() => logCount(goal.id, -1)}
                  className="h-6 w-6 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                  aria-label={`Log −1 for ${goal.title}`}
                >
                  −
                </button>
                <button
                  onClick={() => logCount(goal.id, 1)}
                  className="h-6 w-6 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                  aria-label={`Log +1 for ${goal.title}`}
                >
                  +
                </button>
              </span>
            )}
          </div>
          <Bar pct={widthPct(effort.fraction)} met={effort.met} />
        </div>
      )}

      {goal.outcome.kind === 'count' && !effort && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => logCount(goal.id, -1)}
            className="h-7 w-7 rounded-lg border text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
            aria-label={`Log −1 for ${goal.title}`}
          >
            −
          </button>
          <span className="num text-sm" style={{ color: 'var(--color-text)' }}>
            {Math.round(cumulativeTotal(goal))} / {goal.outcome.target} {goal.outcome.unit}
          </span>
          <button
            onClick={() => logCount(goal.id, 1)}
            className="h-7 w-7 rounded-lg border text-sm"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
            aria-label={`Log +1 for ${goal.title}`}
          >
            +
          </button>
        </div>
      )}

      <span
        className="text-[11px]"
        style={{ color: pace.comparable && !pace.onPace ? 'var(--color-debt)' : 'var(--color-text-muted)' }}
      >
        {pace.text}
      </span>

      {met && (
        <button
          onClick={onReview}
          className="self-start rounded-lg border px-2.5 py-1 text-xs font-semibold"
          style={{ borderColor: 'var(--color-rest)', color: 'var(--color-rest)' }}
        >
          Archive or evolve →
        </button>
      )}
    </li>
  );
}
