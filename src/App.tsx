import { useEffect, useState } from 'react';
import { FixTimerModal } from './components/FixTimerModal';
import { InstallHint } from './components/InstallHint';
import { ItemsView } from './components/ItemsView';
import { SettingsModal } from './components/SettingsModal';
import { TimerPanel } from './components/TimerPanel';
import { useSettings } from './store/settings';

/** Apply the chosen theme to the page, following the OS while set to "system". */
function useTheme() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const light = theme === 'light' || (theme === 'system' && query.matches);
      document.documentElement.classList.toggle('light', light);
      document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
}

export default function App() {
  useTheme();
  const [fixing, setFixing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Third Time</h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="min-h-11 min-w-11 rounded-lg text-text-muted hover:text-text cursor-pointer text-xl"
        >
          ⚙
        </button>
      </header>

      <InstallHint />
      <TimerPanel onFix={() => setFixing(true)} />
      <ItemsView />

      {fixing && <FixTimerModal onClose={() => setFixing(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
