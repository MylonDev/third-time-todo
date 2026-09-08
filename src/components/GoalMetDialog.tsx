import { Modal } from './Modal';
import { useGoals } from '../store/goals';
import type { Goal } from '../types';
import { formatGoalTotal, lineageChain } from '../utils/goal';
import { daysSince } from '../utils/thirdTime';

export function GoalMetDialog({
  goal,
  onArchive,
  onEvolve,
  onClose,
}: {
  goal: Goal;
  onArchive: () => void;
  onEvolve: () => void;
  onClose: () => void;
}) {
  const goals = useGoals((s) => s.goals);
  const chain = lineageChain(goals, goal.id);
  const days = daysSince(goal.createdAt);
  const firstLogged =
    days >= 60 ? `${Math.round(days / 30)} months ago` : days >= 1 ? `${days} days ago` : 'today';

  return (
    <Modal onClose={onClose} label="Goal complete" size="sm">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-sm"
            style={{ background: 'var(--color-rest)', color: 'var(--color-bg)' }}
            aria-hidden
          >
            ✓
          </span>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            You hit it — {goal.title}
          </h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <span className="num">{formatGoalTotal(goal)}</span> logged · first logged {firstLogged}
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onArchive}
            className="rounded-xl border px-3 py-2.5 text-left"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Archive it
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Move to the archive, keep the history
            </span>
          </button>
          <button
            onClick={onEvolve}
            className="rounded-xl border px-3 py-2.5 text-left"
            style={{ borderColor: 'var(--color-accent)', background: 'var(--color-accent-dim)' }}
          >
            <span className="block text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
              Evolve it →
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Start the next goal, linked to this one
            </span>
          </button>
        </div>

        {chain.length > 1 && (
          <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--color-text-muted)' }}
            >
              The chain
            </span>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {chain.map((g, i) => (
                <span key={g.id} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden style={{ color: 'var(--color-text-muted)' }}>→</span>}
                  <span
                    className="rounded-full border px-2 py-0.5"
                    style={{
                      borderColor: g.id === goal.id ? 'var(--color-accent)' : 'var(--color-border)',
                      color: g.id === goal.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    }}
                  >
                    {g.title}
                    {g.completedAt ? ' ✓' : ''}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
