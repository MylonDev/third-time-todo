import type { Habit } from '../types';
import { adherence, dotStates, type DotState } from '../utils/habit';
import { useSettings } from '../store/settings';

function dotStyle(state: DotState): React.CSSProperties {
  if (state === 'done') {
    return { background: 'var(--color-habit)' };
  }
  if (state === 'missed') {
    return {
      background: 'var(--color-surface-2)',
      boxShadow: 'inset 0 0 0 1px var(--color-border-strong)',
    };
  }
  return { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--color-border)' };
}

/**
 * The row / strip readout shared with the Activity tab: the last `days`
 * calendar days as dots (filled = done, empty = missed, ring = not due) plus
 * the trailing adherence percentage over the same window.
 */
export function HabitAdherence({
  habit,
  days = 7,
  showPct = true,
}: {
  habit: Habit;
  days?: number;
  showPct?: boolean;
}) {
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const states = dotStates(habit, dayEndHour, days);
  const { pct, due } = adherence(habit, dayEndHour, days);

  return (
    <div className="flex items-center gap-2.5" title={`Last ${days} days`}>
      <div className="flex gap-1" aria-hidden="true">
        {states.map((s, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{ width: 7, height: 7, ...dotStyle(s) }}
          />
        ))}
      </div>
      {showPct && due > 0 && (
        <span className="num text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {Math.round(pct * 100)}%
        </span>
      )}
    </div>
  );
}
