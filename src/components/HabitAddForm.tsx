import { useState } from 'react';
import type { HabitFreq } from '../types';
import { FreqPicker } from './HabitFreqPicker';

export function HabitAddForm({
  onAdd,
}: {
  onAdd: (params: { name: string; freq: HabitFreq; target?: { amount: number; unit: string } }) => void;
}) {
  const [name, setName] = useState('');
  const [freq, setFreq] = useState<HabitFreq>({ kind: 'daily' });
  const [withTarget, setWithTarget] = useState(false);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');

  const targetValid = !withTarget || (Number(amount) > 0 && unit.trim().length > 0);
  const freqValid = freq.kind !== 'weekdays' || freq.days.length > 0;
  const canAdd = name.trim().length > 0 && targetValid && freqValid;

  const reset = () => {
    setName('');
    setFreq({ kind: 'daily' });
    setWithTarget(false);
    setAmount('');
    setUnit('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    onAdd({
      name: name.trim(),
      freq,
      target: withTarget ? { amount: Number(amount), unit: unit.trim() } : undefined,
    });
    reset();
  };

  const fieldStyle: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    borderColor: 'var(--color-border)',
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-2xl border p-4"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a habit…"
          className="flex-1 rounded-xl px-3 py-2 text-sm border outline-none transition-colors"
          style={fieldStyle}
        />
        <button
          type="submit"
          disabled={!canAdd}
          className="px-4 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40"
          style={{
            background: 'var(--color-habit-dim)',
            color: 'var(--color-habit)',
            borderColor: 'var(--color-habit)',
            fontFamily: 'var(--font-display)',
          }}
        >
          Add
        </button>
      </div>

      <FreqPicker freq={freq} onChange={setFreq} />

      {withTarget ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            Target each time
          </span>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="20"
            aria-label="Target amount"
            className="w-20 rounded-lg px-2 py-1 text-sm border outline-none num"
            style={fieldStyle}
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="minutes"
            aria-label="Target unit"
            className="w-32 rounded-lg px-2 py-1 text-sm border outline-none"
            style={fieldStyle}
          />
          <button
            type="button"
            onClick={() => {
              setWithTarget(false);
              setAmount('');
              setUnit('');
            }}
            className="text-xs font-semibold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setWithTarget(true)}
          className="self-start text-xs font-semibold"
          style={{ color: 'var(--color-text-muted)' }}
        >
          + Add a per-occurrence target
        </button>
      )}
    </form>
  );
}
