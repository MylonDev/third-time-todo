import type { HabitFreq } from '../types';
import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '../utils/habitFreq';

export type FreqKind = HabitFreq['kind'];

const KINDS: { kind: FreqKind; label: string }[] = [
  { kind: 'daily', label: 'Daily' },
  { kind: 'weekly', label: 'Weekly' },
  { kind: 'everyN', label: 'Every N days' },
  { kind: 'weekdays', label: 'Weekdays' },
];

export function FreqPicker({
  freq,
  onChange,
}: {
  freq: HabitFreq;
  onChange: (freq: HabitFreq) => void;
}) {
  const pick = (kind: FreqKind) => {
    if (kind === freq.kind) return;
    if (kind === 'daily') onChange({ kind: 'daily' });
    else if (kind === 'weekly') onChange({ kind: 'weekly' });
    else if (kind === 'everyN') onChange({ kind: 'everyN', n: 3 });
    else onChange({ kind: 'weekdays', days: [] });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => {
          const on = k.kind === freq.kind;
          return (
            <button
              key={k.kind}
              type="button"
              onClick={() => pick(k.kind)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors"
              style={{
                background: on ? 'var(--color-habit-dim)' : 'var(--color-surface-2)',
                borderColor: on ? 'var(--color-habit)' : 'var(--color-border)',
                color: on ? 'var(--color-habit)' : 'var(--color-text-muted)',
              }}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {freq.kind === 'everyN' && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <span>Every</span>
          <div
            className="flex items-center rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <button
              type="button"
              aria-label="Fewer days"
              className="px-2.5 py-1 text-sm"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              onClick={() => onChange({ kind: 'everyN', n: Math.max(2, freq.n - 1) })}
            >
              −
            </button>
            <span className="num px-3 py-1 text-sm" style={{ color: 'var(--color-text)' }}>
              {freq.n}
            </span>
            <button
              type="button"
              aria-label="More days"
              className="px-2.5 py-1 text-sm"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              onClick={() => onChange({ kind: 'everyN', n: freq.n + 1 })}
            >
              +
            </button>
          </div>
          <span>days</span>
        </div>
      )}

      {freq.kind === 'weekdays' && (
        <div className="flex gap-1.5">
          {WEEKDAY_SHORT.map((label, i) => {
            const on = freq.days.includes(i);
            return (
              <button
                key={i}
                type="button"
                aria-label={WEEKDAY_LABELS[i]}
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    kind: 'weekdays',
                    days: on ? freq.days.filter((d) => d !== i) : [...freq.days, i],
                  })
                }
                className="w-8 h-8 rounded-lg text-xs font-semibold border transition-colors"
                style={{
                  background: on ? 'var(--color-habit)' : 'var(--color-surface-2)',
                  borderColor: on ? 'var(--color-habit)' : 'var(--color-border)',
                  color: on ? 'var(--color-bg)' : 'var(--color-text-muted)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
