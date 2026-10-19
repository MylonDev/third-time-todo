import { useState } from 'react';

const CHIPS = [10, 15, 20, 30, 45, 60];

/** The longest Timed session the picker accepts. */
const MAX_MINUTES = 600;

/** Pick how long a Timed session runs, then start it. */
export function TimedStart({
  onStart,
  initialMinutes = 20,
}: {
  onStart: (plannedMs: number) => void;
  /** Where the length begins. Remount to change it. */
  initialMinutes?: number;
}) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Length" className="flex flex-wrap items-center gap-2">
        {CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={minutes === m}
            onClick={() => setMinutes(m)}
            className={`press min-h-10 cursor-pointer rounded-full border px-3.5 text-sm font-medium ${
              minutes === m ? 'bg-accent-dim border-accent-edge text-accent' : 'border-border text-text-muted hover:text-text'
            }`}
          >
            {m} min
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <span className="sr-only">Custom minutes</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_MINUTES}
            aria-label="Custom minutes"
            value={Number.isFinite(minutes) ? minutes : ''}
            onChange={(e) => setMinutes(e.target.value === '' ? Number.NaN : Number(e.target.value))}
            className="w-20 min-h-10 rounded-lg px-2 bg-surface-2 border border-border text-text outline-none"
          />
          min
        </label>
      </div>
      <button
        type="button"
        disabled={!valid}
        onClick={() => onStart(minutes * 60_000)}
        className="press min-h-12 cursor-pointer rounded-3xl bg-accent font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start
      </button>
    </div>
  );
}
