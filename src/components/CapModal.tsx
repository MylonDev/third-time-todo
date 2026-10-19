import { useState } from 'react';
import { useSettings } from '../store/settings';
import { Modal } from './Modal';

/** The most a week can hold. */
const MAX_HOURS = 168;

/** Set or clear the weekly cap, in hours to the half hour. */
export function CapModal({ onClose }: { onClose: () => void }) {
  const capMin = useSettings((s) => s.weeklyCapMin);
  const setCap = useSettings((s) => s.setWeeklyCapMin);
  const [hours, setHours] = useState(capMin ? String(capMin / 60) : '');

  const value = Number(hours);
  const valid = hours !== '' && value >= 0.5 && value <= MAX_HOURS;

  const save = () => {
    if (!valid) return;
    setCap(Math.round(value * 2) * 30);
    onClose();
  };

  return (
    <Modal label="Weekly cap" onClose={onClose} size="sm" className="p-5 gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-5"
      >
        <div>
          <h2 className="text-lg font-semibold">Weekly cap</h2>
          <p className="text-sm text-text-muted">
            The most time your practices may add up to in a week. Raising one practice past it means lowering another.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Hours a week</span>
          <input
            type="number"
            inputMode="decimal"
            min={0.5}
            max={MAX_HOURS}
            step={0.5}
            placeholder="8"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="min-h-12 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="press min-h-12 cursor-pointer rounded-full border border-border font-medium text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="press min-h-12 cursor-pointer rounded-full bg-accent font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
        {capMin !== null && (
          <button
            type="button"
            onClick={() => {
              setCap(null);
              onClose();
            }}
            className="min-h-10 self-start cursor-pointer rounded-lg border border-border px-3 text-sm text-text-muted hover:text-text"
          >
            Remove cap
          </button>
        )}
      </form>
    </Modal>
  );
}
