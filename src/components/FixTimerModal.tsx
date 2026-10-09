import { useState } from 'react';
import { useNow } from '../hooks/useNow';
import { useTimer } from '../store/timer';
import type { Painted } from '../utils/ledger';
import { fixRefusal } from '../utils/ledger';
import { Modal } from './Modal';
import { Segmented } from './Segmented';

const CHIPS = [5, 10, 15, 30];

const WAS_OPTIONS = [
  { value: 'should', label: 'Should' },
  { value: 'want', label: 'Want' },
  { value: 'rest', label: 'Rest' },
] as const;

const THEN_OPTIONS = [
  { value: 'should', label: 'Should' },
  { value: 'want', label: 'Want' },
  { value: 'rest', label: 'Stopped' },
] as const;

const NAME: Record<Painted, string> = { should: 'Should', want: 'Want', rest: 'Rest' };

function clock(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * "Those minutes were X, and since then I've been Y." One question that covers
 * a forgotten switch in either direction and a forgotten stop.
 */
export function FixTimerModal({ onClose }: { onClose: () => void }) {
  const now = useNow();
  const fix = useTimer((s) => s.fix);
  const current = useTimer((s) => s.entries.find((e) => e.deletedAt === undefined && e.endedAt === null));

  const [minutes, setMinutes] = useState(10);
  const [was, setWas] = useState<Painted>(current?.state === 'should' ? 'want' : 'should');
  const [then, setThen] = useState<Painted>(current?.state ?? 'rest');
  const [error, setError] = useState<string | null>(null);

  const ms = minutes * 60_000;
  const refusal = fixRefusal({ ms });
  const from = now - ms;
  const preview =
    refusal === null
      ? `${NAME[was]} from ${clock(from)} to ${clock(now)}, ${
          then === 'rest' ? 'then the timer stops.' : `then ${NAME[then]}.`
        }`
      : refusal;

  const apply = () => {
    const err = fix({ ms, was, then });
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal label="Fix timer" onClose={onClose} size="md" className="p-5 gap-5">
      <div>
        <h2 className="text-lg font-semibold">Fix timer</h2>
        <p className="text-sm text-text-muted">Forgot to switch or stop? Say what really happened.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="section-label mb-1">How long ago</legend>
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => setMinutes(m)}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium cursor-pointer border ${
                minutes === m
                  ? 'bg-accent-dim border-accent-edge text-accent'
                  : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {m} min
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <span className="sr-only">Minutes</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              aria-label="Minutes"
              value={Number.isFinite(minutes) ? minutes : ''}
              onChange={(e) => {
                setError(null);
                setMinutes(e.target.value === '' ? Number.NaN : Number(e.target.value));
              }}
              className="w-20 min-h-10 rounded-lg px-2 bg-surface-2 border border-border text-text outline-none"
            />
            min
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span className="section-label">Those minutes were</span>
        <Segmented<Painted> label="Those minutes were" value={was} options={[...WAS_OPTIONS]} onChange={setWas} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="section-label">Since then I've been</span>
        <Segmented<Painted> label="Since then" value={then} options={[...THEN_OPTIONS]} onChange={setThen} />
      </div>

      <p data-testid="fix-preview" className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
        {preview}
      </p>
      {error && (
        <p role="alert" className="text-sm text-debt">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClose}
          className="press min-h-12 rounded-full border border-border text-text-muted font-medium cursor-pointer hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={refusal !== null}
          className="press min-h-12 rounded-full bg-accent text-on-accent font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
