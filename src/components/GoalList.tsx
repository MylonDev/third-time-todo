import { useState } from 'react';
import { useGoals } from '../store/goals';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { GoalMetDialog } from './GoalMetDialog';
import { formatGoalTotal } from '../utils/goal';

type Dialog =
  | { kind: 'none' }
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'evolve'; fromId: string }
  | { kind: 'review'; id: string };

export function GoalList() {
  const goals = useGoals((s) => s.goals);
  const archiveGoal = useGoals((s) => s.archiveGoal);
  const completeGoal = useGoals((s) => s.completeGoal);
  const deleteGoal = useGoals((s) => s.deleteGoal);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const [showArchived, setShowArchived] = useState(false);

  const active = goals.filter((g) => !g.archivedAt).sort((a, b) => a.order - b.order);
  const archived = goals
    .filter((g) => g.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  const byId = (id: string) => goals.find((g) => g.id === id);
  const close = () => setDialog({ kind: 'none' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          Goals · {active.length} active
        </span>
        <button
          onClick={() => setDialog({ kind: 'add' })}
          className="rounded-xl border px-3 py-1.5 text-sm font-semibold"
          style={{
            background: 'var(--color-accent-dim)',
            color: 'var(--color-accent)',
            borderColor: 'var(--color-accent)',
          }}
        >
          + New goal
        </button>
      </div>

      {active.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No goals yet — add one to work toward an outcome.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() => setDialog({ kind: 'edit', id: g.id })}
              onReview={() => setDialog({ kind: 'review', id: g.id })}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="self-start text-xs font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showArchived ? '▾' : '▸'} {archived.length} archived goal{archived.length === 1 ? '' : 's'}
          </button>
          {showArchived &&
            archived.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                <span>
                  {g.title}
                  {g.completedAt ? ' ✓' : ''} · <span className="num">{formatGoalTotal(g)}</span>
                </span>
                <button
                  onClick={() => deleteGoal(g.id)}
                  className="text-xs"
                  style={{ color: 'var(--color-debt)' }}
                  aria-label={`Delete ${g.title}`}
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {dialog.kind === 'add' && <GoalForm onClose={close} />}

      {dialog.kind === 'edit' && byId(dialog.id) && (
        <GoalForm goal={byId(dialog.id)} onClose={close} />
      )}

      {dialog.kind === 'evolve' && (
        <GoalForm evolvesFromId={dialog.fromId} onClose={close} />
      )}

      {dialog.kind === 'review' && byId(dialog.id) && (
        <GoalMetDialog
          goal={byId(dialog.id)!}
          onClose={close}
          onArchive={() => {
            completeGoal(dialog.id);
            archiveGoal(dialog.id);
            close();
          }}
          onEvolve={() => {
            completeGoal(dialog.id);
            setDialog({ kind: 'evolve', fromId: dialog.id });
          }}
        />
      )}
    </div>
  );
}
