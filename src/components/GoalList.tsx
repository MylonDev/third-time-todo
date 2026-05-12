import { useState, useEffect, useRef } from 'react';
import { useGoals } from '../store/goals';
import {
  getCurrentPeriodKey,
  getPeriodLabel,
  getProgressForPeriod,
  formatGoalProgress,
  formatGoalTarget,
} from '../utils/goalPeriod';
import type { FocusTarget, Goal, GoalPeriod, GoalType } from '../types';

// ── GoalMenu ──────────────────────────────────────────────────────────────────

function GoalMenu({
  onEdit,
  onDelete,
  onAdjustTime,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onAdjustTime?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all opacity-60 hover:opacity-100 hover:bg-[var(--color-surface-2)]"
        style={{ color: 'var(--color-text-muted)' }}
        title="Actions"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-20 rounded-xl shadow-xl py-1 min-w-[140px] border"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            Edit
          </button>
          {onAdjustTime && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdjustTime(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm transition-colors"
              style={{ color: 'var(--color-text)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              Adjust time
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-debt)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-debt-dim)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  isFocused,
  timerState,
  focusSegmentStart,
  onSetFocus,
}: {
  goal: Goal;
  isFocused: boolean;
  timerState: 'idle' | 'working' | 'on-break';
  focusSegmentStart: number | null;
  onSetFocus: (target: FocusTarget | null) => void;
}) {
  const { adjustProgress, updateGoal, deleteGoal } = useGoals();
  const [, tick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(goal.title);
  const [editTarget, setEditTarget] = useState('');
  const [editDeadline, setEditDeadline] = useState(goal.deadline ?? '');
  const [showTimeEdit, setShowTimeEdit] = useState(false);
  const [timeEditMin, setTimeEditMin] = useState('');

  // Live tick when focused and working
  useEffect(() => {
    if (!isFocused || timerState !== 'working') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isFocused, timerState]);

  const periodKey = getCurrentPeriodKey(goal);
  const committedMs = getProgressForPeriod(goal, periodKey);
  const liveValue =
    goal.type === 'time' && isFocused && timerState === 'working' && focusSegmentStart
      ? committedMs + (Date.now() - focusSegmentStart)
      : committedMs;

  const complete = liveValue >= goal.target;
  const progressPct = goal.type !== 'boolean'
    ? Math.min(100, (liveValue / goal.target) * 100)
    : liveValue >= 1 ? 100 : 0;

  // Click anywhere on the card (not on a button/input) to toggle focus
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
    onSetFocus(isFocused ? null : { kind: 'goal', id: goal.id });
  };

  const saveEdit = () => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      const targetNum = Number(editTarget);
      updateGoal(goal.id, {
        title: trimmed,
        ...(editTarget && !isNaN(targetNum) && targetNum > 0
          ? { target: goal.type === 'time' ? targetNum * 60_000 : targetNum }
          : {}),
        deadline: editDeadline || undefined,
      });
    }
    setEditing(false);
  };

  const handleTimeAdjust = () => {
    const min = parseFloat(timeEditMin);
    if (!isNaN(min)) {
      adjustProgress(goal.id, periodKey, Math.round(min * 60_000));
    }
    setShowTimeEdit(false);
    setTimeEditMin('');
  };

  const cardStyle: React.CSSProperties = isFocused
    ? {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-accent)',
        borderLeftWidth: '3px',
        boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.08)',
        cursor: 'pointer',
      }
    : complete
    ? {
        background: 'var(--color-surface-2)',
        borderColor: 'var(--color-rest)',
        opacity: 0.8,
        cursor: 'pointer',
      }
    : {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        cursor: 'pointer',
      };

  return (
    <li
      style={cardStyle}
      className="flex flex-col rounded-xl border transition-[border-color,background-color,opacity]"
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={saveEdit}
                className="w-full text-sm rounded-lg px-2 py-1 outline-none border"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-accent)' }}
              />
              {goal.type !== 'boolean' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    placeholder={goal.type === 'time' ? 'Target min' : 'Target times'}
                    value={editTarget}
                    onChange={(e) => setEditTarget(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                    className="w-28 text-xs rounded-lg px-2 py-1 outline-none border"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {goal.type === 'time' ? 'min' : '×'}
                  </span>
                </div>
              )}
              <input
                type="date"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
                className="text-xs rounded-lg px-2 py-1 outline-none border w-36"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              />
            </div>
          ) : (
            <>
              {/* Title row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm" style={{ color: complete ? 'var(--color-text-muted)' : 'var(--color-text)' }}>
                  {goal.title}
                </span>
                {isFocused && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                    style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                  >
                    Focused
                  </span>
                )}
              </div>

              {/* Period + deadline */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {getPeriodLabel(goal)}
                </span>
                {goal.deadline && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    · Due {goal.deadline}
                  </span>
                )}
              </div>

              {/* Progress controls */}
              <div className="mt-2">
                {goal.type === 'boolean' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); adjustProgress(goal.id, periodKey, liveValue >= 1 ? -1 : 1); }}
                    className="text-xs px-3 py-1 rounded-lg font-semibold transition-all"
                    style={{
                      background: complete ? 'var(--color-rest)' : 'var(--color-surface-2)',
                      color: complete ? 'var(--color-bg)' : 'var(--color-text-muted)',
                      border: `1px solid ${complete ? 'var(--color-rest)' : 'var(--color-border)'}`,
                    }}
                  >
                    {complete ? '✓ Done' : 'Mark done'}
                  </button>
                ) : goal.type === 'counter' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); adjustProgress(goal.id, periodKey, -1); }}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-opacity hover:opacity-80"
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                    >
                      −
                    </button>
                    <span className="text-sm font-semibold min-w-[60px] text-center" style={{ color: complete ? 'var(--color-rest)' : 'var(--color-text)' }}>
                      {liveValue} / {goal.target}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); adjustProgress(goal.id, periodKey, 1); }}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-opacity hover:opacity-80"
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  // time goal
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold" style={{ color: complete ? 'var(--color-rest)' : isFocused && timerState === 'working' ? 'var(--color-accent)' : 'var(--color-text)' }}>
                      {formatGoalProgress(goal, liveValue)}
                    </span>
                    {showTimeEdit && (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          autoFocus
                          type="number"
                          placeholder="±min"
                          value={timeEditMin}
                          onChange={(e) => setTimeEditMin(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleTimeAdjust();
                            if (e.key === 'Escape') { setShowTimeEdit(false); setTimeEditMin(''); }
                          }}
                          onBlur={handleTimeAdjust}
                          className="w-20 text-xs rounded px-1.5 py-1 outline-none border"
                          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-accent)' }}
                        />
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>min (+ or −)</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                {goal.type !== 'boolean' && (
                  <div
                    className="mt-1.5 h-1 rounded-full overflow-hidden"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${progressPct}%`,
                        background: complete ? 'var(--color-rest)' : isFocused && timerState === 'working' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                      }}
                    />
                  </div>
                )}

                <div className="mt-0.5">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Target: {formatGoalTarget(goal)} {getPeriodLabel(goal).toLowerCase()}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {!editing && (
          <GoalMenu
            onEdit={() => {
              setEditTitle(goal.title);
              setEditTarget(
                goal.type === 'time'
                  ? String(Math.round(goal.target / 60_000))
                  : goal.type === 'counter'
                  ? String(goal.target)
                  : ''
              );
              setEditDeadline(goal.deadline ?? '');
              setEditing(true);
            }}
            onDelete={() => deleteGoal(goal.id)}
            onAdjustTime={goal.type === 'time' ? () => { setShowTimeEdit(true); setTimeEditMin(''); } : undefined}
          />
        )}
      </div>
    </li>
  );
}

// ── Add Goal Form ─────────────────────────────────────────────────────────────

function AddGoalForm({ onDone }: { onDone: () => void }) {
  const { addGoal } = useGoals();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<GoalType>('time');
  const [period, setPeriod] = useState<GoalPeriod>('daily');
  const [periodDays, setPeriodDays] = useState('7');
  const [targetMin, setTargetMin] = useState('');
  const [targetTimes, setTargetTimes] = useState('');
  const [deadline, setDeadline] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let target = 1;
    if (type === 'time') {
      const min = Number(targetMin);
      target = isNaN(min) || min <= 0 ? 30 * 60_000 : min * 60_000;
    } else if (type === 'counter') {
      const times = Number(targetTimes);
      target = isNaN(times) || times <= 0 ? 1 : times;
    }

    addGoal({
      title: title.trim(),
      type,
      period,
      periodDays: period === 'custom' ? Math.max(1, Number(periodDays) || 7) : undefined,
      target,
      deadline: deadline || undefined,
    });
    onDone();
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    borderColor: 'var(--color-border)',
  };

  const segBtn = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
    color: active ? '#fff' : 'var(--color-text-muted)',
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
  });

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Goal name…"
        className="rounded-lg px-3 py-2 text-sm outline-none border"
        style={inputStyle}
      />

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Type</span>
        <div className="flex gap-1.5 flex-wrap">
          {(['boolean', 'counter', 'time'] as GoalType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={segBtn(type === t)}
            >
              {t === 'boolean' ? 'Done/Not done' : t === 'counter' ? 'Counter' : 'Time'}
            </button>
          ))}
        </div>
      </div>

      {type === 'time' && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            value={targetMin}
            onChange={(e) => setTargetMin(e.target.value)}
            placeholder="30"
            className="w-20 rounded-lg px-2 py-1.5 text-sm outline-none border"
            style={inputStyle}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>minutes per period</span>
        </div>
      )}
      {type === 'counter' && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            value={targetTimes}
            onChange={(e) => setTargetTimes(e.target.value)}
            placeholder="1"
            className="w-20 rounded-lg px-2 py-1.5 text-sm outline-none border"
            style={inputStyle}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>times per period</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Reset period</span>
        <div className="flex gap-1.5 flex-wrap">
          {(['daily', 'weekly', 'custom'] as GoalPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={segBtn(period === p)}
            >
              {p === 'custom' ? 'Custom' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="2"
                value={periodDays}
                onChange={(e) => setPeriodDays(e.target.value)}
                className="w-14 rounded-lg px-2 py-1 text-xs outline-none border"
                style={inputStyle}
              />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>days</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Deadline (optional)</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="text-xs rounded-lg px-2 py-1 outline-none border"
          style={inputStyle}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--color-accent)', color: '#fff', fontFamily: 'var(--font-display)' }}
        >
          Add Goal
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-xl text-sm opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── GoalList (exported) ───────────────────────────────────────────────────────

interface GoalListProps {
  focusedItem: FocusTarget | null;
  timerState: 'idle' | 'working' | 'on-break';
  focusSegmentStart: number | null;
  onSetFocus: (target: FocusTarget | null) => void;
}

export function GoalList({ focusedItem, timerState, focusSegmentStart, onSetFocus }: GoalListProps) {
  const { goals } = useGoals();
  const [showForm, setShowForm] = useState(false);

  const sorted = [...goals].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-3">
      {/* Add goal button — prominent, left-aligned */}
      {!showForm && (
        <div>
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              fontFamily: 'var(--font-display)',
            }}
          >
            + Add Goal
          </button>
        </div>
      )}

      {showForm && <AddGoalForm onDone={() => setShowForm(false)} />}

      {sorted.length === 0 && !showForm && (
        <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
          No goals yet — click above to add one
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {sorted.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            isFocused={focusedItem?.kind === 'goal' && focusedItem.id === goal.id}
            timerState={timerState}
            focusSegmentStart={focusSegmentStart}
            onSetFocus={onSetFocus}
          />
        ))}
      </ul>
    </div>
  );
}
