import { useState } from 'react';
import { useSettings } from '../store/settings';
import type { Theme } from '../store/settings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
];

export function OptionsPanel({ isOpen, onClose }: Props) {
  const {
    longWorkReminderMin, soundsEnabled, theme,
    breakIncrements,
    setLongWorkReminderMin, setSoundsEnabled, setTheme,
    setBreakIncrements,
  } = useSettings();

  const [newIncrement, setNewIncrement] = useState('');

  if (!isOpen) return null;

  const handleAddIncrement = () => {
    const val = Number(newIncrement);
    if (val > 0 && !breakIncrements.includes(val)) {
      setBreakIncrements([...breakIncrements, val].sort((a, b) => a - b));
    }
    setNewIncrement('');
  };

  const handleRemoveIncrement = (m: number) => {
    setBreakIncrements(breakIncrements.filter((v) => v !== m));
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-sm h-full flex flex-col shadow-2xl overflow-y-auto border-l"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h2
            className="text-base font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            Options
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none transition-opacity opacity-40 hover:opacity-100"
            style={{ color: 'var(--color-text)' }}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 px-5 py-5">

          {/* Theme */}
          <section>
            <label className="block mb-3" style={labelStyle}>Theme</label>
            <div
              className="flex rounded-xl overflow-hidden border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className="flex-1 py-2 text-sm font-semibold transition-colors"
                  style={
                    theme === t.value
                      ? { background: 'var(--color-accent)', color: '#fff' }
                      : { background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {/* Sounds */}
          <section>
            <label className="block mb-3" style={labelStyle}>Notifications</label>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  Sound alerts
                </span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Rest end, 1-min warning, bank empty
                </p>
              </div>
              <button
                role="switch"
                aria-checked={soundsEnabled}
                onClick={() => setSoundsEnabled(!soundsEnabled)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                style={{
                  background: soundsEnabled ? 'var(--color-accent)' : 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  style={{ transform: soundsEnabled ? 'translateX(22px)' : 'translateX(4px)' }}
                />
              </button>
            </div>
          </section>

          {/* Activity reminder */}
          <section>
            <label className="block mb-3" style={labelStyle}>Activity Reminder</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  Remind me after
                </span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Get a nudge to rest
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="15"
                  max="480"
                  value={longWorkReminderMin}
                  onChange={(e) => setLongWorkReminderMin(Number(e.target.value))}
                  className="w-16 rounded-lg px-2 py-1 text-sm text-center outline-none transition-colors border"
                  style={{
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-border)',
                  }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>min</span>
              </div>
            </div>
          </section>

          {/* Break increments */}
          <section>
            <label className="block mb-3" style={labelStyle}>Rest Increments</label>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Quick-pick options when starting a rest
            </p>
            <div className="flex gap-2 flex-wrap items-center">
              {breakIncrements.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: 'var(--color-rest-dim)',
                    color: 'var(--color-rest)',
                    border: '1px solid rgba(52,211,153,0.2)',
                  }}
                >
                  {m} min
                  <button
                    onClick={() => handleRemoveIncrement(m)}
                    className="transition-opacity opacity-50 hover:opacity-100 ml-0.5"
                    style={{ color: 'var(--color-rest)' }}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  value={newIncrement}
                  onChange={(e) => setNewIncrement(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddIncrement(); }}
                  placeholder="+"
                  className="w-12 rounded-lg px-2 py-1 text-xs text-center outline-none transition-colors border"
                  style={{
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-border)',
                  }}
                />
                <button
                  onClick={handleAddIncrement}
                  className="text-xs font-semibold transition-opacity opacity-60 hover:opacity-100"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Add
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
