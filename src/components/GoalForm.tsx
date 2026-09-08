import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useGoals } from '../store/goals';
import type { EffortTarget, Goal, GoalOutcome, GoalPeriod } from '../types';
import { goalDraftIsValid, lineageChain, type GoalDraft } from '../utils/goal';

const label = 'text-xs font-semibold uppercase tracking-wide';
const labelStyle = { color: 'var(--color-text-muted)' } as const;

const fieldStyle = {
  background: 'var(--color-surface-2)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
} as const;

type Measure = 'time' | 'count' | 'open';

function draftFromGoal(goal: Goal | undefined): GoalDraft {
  if (!goal)
    return {
      title: '',
      measure: 'count',
      targetHours: '',
      unit: '',
      count: '',
      milestones: [],
      effortEnabled: false,
      effortAmount: '',
    };
  return {
    title: goal.title,
    measure: goal.outcome.kind,
    targetHours: goal.outcome.kind === 'time' ? String(goal.outcome.targetHours) : '',
    unit: goal.outcome.kind === 'count' ? goal.outcome.unit : '',
    count: goal.outcome.kind === 'count' ? String(goal.outcome.target) : '',
    milestones: goal.milestones.map((m) => m.label),
    effortEnabled: !!goal.effort,
    effortAmount: goal.effort
      ? String(goal.effort.metric === 'time' ? goal.effort.amount / 3_600_000 : goal.effort.amount)
      : '',
  };
}

export function GoalForm({
  goal,
  evolvesFromId,
  onClose,
  onCreated,
}: {
  /** Present = editing; absent = adding. */
  goal?: Goal;
  evolvesFromId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const goals = useGoals((s) => s.goals);
  const addGoal = useGoals((s) => s.addGoal);
  const updateGoal = useGoals((s) => s.updateGoal);

  const [d, setD] = useState<GoalDraft>(() => draftFromGoal(goal));
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [doneWhen, setDoneWhen] = useState(goal?.doneWhen ?? '');
  const [effortPeriod, setEffortPeriod] = useState<GoalPeriod>(goal?.effort?.period ?? 'weekly');
  const [effortPeriodDays, setEffortPeriodDays] = useState(String(goal?.effort?.periodDays ?? 3));
  const [linkTo, setLinkTo] = useState(evolvesFromId ?? goal?.evolvesFromId ?? '');

  const patch = <K extends keyof GoalDraft>(k: K, v: GoalDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const ancestor = useMemo(
    () => (linkTo ? lineageChain(goals, linkTo) : []),
    [goals, linkTo]
  );

  const valid = goalDraftIsValid(d);

  const buildOutcome = (): GoalOutcome => {
    if (d.measure === 'time') return { kind: 'time', targetHours: Number(d.targetHours) || 0 };
    if (d.measure === 'count')
      return { kind: 'count', unit: d.unit.trim() || 'units', target: Number(d.count) || 0 };
    return { kind: 'open' };
  };

  const buildEffort = (): EffortTarget | undefined => {
    if (!d.effortEnabled || !(Number(d.effortAmount) > 0)) return undefined;
    const metric: EffortTarget['metric'] = d.measure === 'count' ? 'count' : 'time';
    const amount = metric === 'time' ? Number(d.effortAmount) * 3_600_000 : Number(d.effortAmount);
    return {
      metric,
      amount,
      period: effortPeriod,
      ...(effortPeriod === 'custom' ? { periodDays: Math.max(1, Number(effortPeriodDays) || 1) } : {}),
    };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const milestones = d.milestones.map((s) => s.trim()).filter(Boolean).map((label) => ({ label }));
    const common = {
      title: d.title.trim(),
      outcome: buildOutcome(),
      effort: buildEffort(),
      deadline: deadline || undefined,
      doneWhen: doneWhen.trim() || undefined,
    };
    if (goal) {
      updateGoal(goal.id, {
        ...common,
        evolvesFromId: linkTo || undefined,
        milestones: milestones.map((m, i) => ({
          id: goal.milestones[i]?.id ?? crypto.randomUUID(),
          label: m.label,
          doneAt: goal.milestones[i]?.doneAt,
        })),
      });
      onClose();
    } else {
      const id = addGoal({ ...common, milestones, evolvesFromId: linkTo || undefined });
      onCreated?.(id);
      onClose();
    }
  };

  const measureBtn = (m: Measure, title: string, sub: string) => (
    <button
      key={m}
      type="button"
      onClick={() => patch('measure', m)}
      className="flex-1 rounded-xl border px-3 py-2 text-left transition-colors"
      style={{
        background: d.measure === m ? 'var(--color-accent-dim)' : 'var(--color-surface-2)',
        borderColor: d.measure === m ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      <span
        className="block text-sm font-semibold"
        style={{ color: d.measure === m ? 'var(--color-accent)' : 'var(--color-text)' }}
      >
        {title}
      </span>
      <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {sub}
      </span>
    </button>
  );

  return (
    <Modal onClose={onClose} label={goal ? 'Edit goal' : 'New goal'} size="md">
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 overflow-y-auto">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          {goal ? 'Edit goal' : 'New goal'}
        </h2>

        {ancestor.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-xl border px-3 py-2 text-xs"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <span className={label} style={labelStyle}>
              Evolves from
            </span>
            {ancestor.map((g, i) => (
              <span key={g.id} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>→</span>}
                <span style={{ color: 'var(--color-text)' }}>{g.title}</span>
              </span>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Name
          </span>
          <input
            autoFocus
            value={d.title}
            onChange={(e) => patch('title', e.target.value)}
            placeholder="e.g. Cycle 1,000 km this year"
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Measure
          </span>
          <div className="flex gap-2">
            {measureBtn('time', 'Time', 'hours banked')}
            {measureBtn('count', 'Count', 'a number you name')}
            {measureBtn('open', 'Open', 'milestones only')}
          </div>
        </div>

        {d.measure === 'count' && (
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className={label} style={labelStyle}>
                Unit
              </span>
              <input
                value={d.unit}
                onChange={(e) => patch('unit', e.target.value)}
                placeholder="km"
                className="rounded-xl border px-3 py-2 text-sm outline-none"
                style={fieldStyle}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className={label} style={labelStyle}>
                Target
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={d.count}
                onChange={(e) => patch('count', e.target.value)}
                placeholder="1000"
                className="num rounded-xl border px-3 py-2 text-sm outline-none"
                style={fieldStyle}
              />
            </label>
          </div>
        )}

        {d.measure === 'time' && (
          <label className="flex flex-col gap-1.5">
            <span className={label} style={labelStyle}>
              Target hours
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={d.targetHours}
              onChange={(e) => patch('targetHours', e.target.value)}
              placeholder="150"
              className="num rounded-xl border px-3 py-2 text-sm outline-none"
              style={fieldStyle}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Done when · optional
          </span>
          <input
            value={doneWhen}
            onChange={(e) => setDoneWhen(e.target.value)}
            placeholder="a sentence that says you’ve really arrived"
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Deadline · optional
          </span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="num rounded-xl border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </label>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
            <input
              type="checkbox"
              checked={d.effortEnabled}
              onChange={(e) => patch('effortEnabled', e.target.checked)}
            />
            <span className={label} style={labelStyle}>
              Recurring effort target · optional
            </span>
          </label>
          {d.effortEnabled && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="number"
                inputMode="numeric"
                value={d.effortAmount}
                onChange={(e) => patch('effortAmount', e.target.value)}
                placeholder={d.measure === 'count' ? 'amount' : 'hours'}
                className="num w-24 rounded-xl border px-3 py-2 outline-none"
                style={fieldStyle}
              />
              <span style={{ color: 'var(--color-text-muted)' }}>
                {d.measure === 'count' ? (d.unit.trim() || 'units') : 'hours'} per
              </span>
              <select
                value={effortPeriod}
                onChange={(e) => setEffortPeriod(e.target.value as GoalPeriod)}
                className="rounded-xl border px-2 py-2 outline-none"
                style={fieldStyle}
              >
                <option value="daily">day</option>
                <option value="weekly">week</option>
                <option value="custom">N days</option>
              </select>
              {effortPeriod === 'custom' && (
                <input
                  type="number"
                  inputMode="numeric"
                  value={effortPeriodDays}
                  onChange={(e) => setEffortPeriodDays(e.target.value)}
                  className="num w-16 rounded-xl border px-3 py-2 outline-none"
                  style={fieldStyle}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label} style={labelStyle}>
            Milestones · optional
          </span>
          {d.milestones.map((m, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={m}
                onChange={(e) =>
                  patch(
                    'milestones',
                    d.milestones.map((x, j) => (j === i ? e.target.value : x))
                  )
                }
                placeholder={`Milestone ${i + 1}`}
                className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
                style={fieldStyle}
              />
              <button
                type="button"
                onClick={() =>
                  patch(
                    'milestones',
                    d.milestones.filter((_, j) => j !== i)
                  )
                }
                className="px-2 text-sm"
                style={{ color: 'var(--color-text-muted)' }}
                aria-label={`Remove milestone ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patch('milestones', [...d.milestones, ''])}
            className="self-start text-xs font-semibold"
            style={{ color: 'var(--color-accent)' }}
          >
            + Add milestone
          </button>
        </div>

        {goals.filter((g) => g.id !== goal?.id).length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className={label} style={labelStyle}>
              Evolves from · optional
            </span>
            <select
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
              style={fieldStyle}
            >
              <option value="">none</option>
              {goals
                .filter((g) => g.id !== goal?.id)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </label>
        )}

        {!valid && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            A goal needs a target number, a milestone, or an effort target — otherwise it’s a task.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={!valid}
            className="rounded-xl border px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
            }}
          >
            {goal ? 'Save' : 'Create goal'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
