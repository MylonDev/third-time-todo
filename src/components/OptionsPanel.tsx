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

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 w-full max-w-sm h-full flex flex-col shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Options</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 px-5 py-5">
          {/* Theme */}
          <section>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Theme
            </label>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    theme === t.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {/* Sounds */}
          <section>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Notifications
            </label>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300">Sound alerts</span>
                <p className="text-xs text-gray-400 mt-0.5">Rest end, 1-min warning, bank empty</p>
              </div>
              <button
                role="switch"
                aria-checked={soundsEnabled}
                onClick={() => setSoundsEnabled(!soundsEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  soundsEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    soundsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Activity reminder */}
          <section>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Activity Reminder
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <span className="text-sm text-gray-700 dark:text-gray-300">Remind me after</span>
                <p className="text-xs text-gray-400 mt-0.5">Get a nudge to rest</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="15"
                  max="480"
                  value={longWorkReminderMin}
                  onChange={(e) => setLongWorkReminderMin(Number(e.target.value))}
                  className="w-16 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1 text-sm text-center outline-none focus:border-indigo-400"
                />
                <span className="text-xs text-gray-400">min</span>
              </div>
            </div>
          </section>

          {/* Break increments */}
          <section>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Rest Increments
            </label>
            <p className="text-xs text-gray-400 mb-2">Quick-pick options when starting a rest</p>
            <div className="flex gap-2 flex-wrap items-center">
              {breakIncrements.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium"
                >
                  {m} min
                  <button
                    onClick={() => handleRemoveIncrement(m)}
                    className="text-emerald-400 hover:text-red-400 transition-colors ml-0.5"
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
                  className="w-12 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1 text-xs text-center outline-none focus:border-indigo-400 placeholder-gray-400"
                />
                <button
                  onClick={handleAddIncrement}
                  className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
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
