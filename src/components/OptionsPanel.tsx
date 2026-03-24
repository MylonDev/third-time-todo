import { useSettings } from '../store/settings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function OptionsPanel({ isOpen, onClose }: Props) {
  const { longWorkReminderMin, soundsEnabled, darkMode, setLongWorkReminderMin, setSoundsEnabled, setDarkMode } = useSettings();

  if (!isOpen) return null;

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
          {/* Appearance */}
          <section>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Appearance
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Dark mode</span>
              <button
                role="switch"
                aria-checked={darkMode}
                onClick={() => setDarkMode(!darkMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  darkMode ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
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
                <p className="text-xs text-gray-400 mt-0.5">Break end, 1-min warning, bank empty</p>
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

          {/* Long work reminder */}
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
        </div>
      </div>
    </div>
  );
}
