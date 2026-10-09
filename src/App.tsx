import { useEffect, useState } from 'react';
import { FixTimerModal } from './components/FixTimerModal';
import { InstallHint } from './components/InstallHint';
import { ItemsView, type View } from './components/ItemsView';
import { SettingsModal } from './components/SettingsModal';
import { SyncIndicator } from './components/SyncIndicator';
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

const VIEWS: { value: View; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'later', label: 'Later' },
];

export default function App() {
  useTheme();
  const [fixing, setFixing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>('today');

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32 pt-4 flex flex-col gap-4">
      <header className="flex items-center justify-between min-h-11">
        <div className="flex items-center gap-2.5">
          {/* The seal: the only kanji in the app, and only as a mark. */}
          <span
            aria-hidden="true"
            className="flex size-[30px] -rotate-[4deg] items-center justify-center rounded-[7px] bg-seal text-[1.1875rem] font-bold text-on-seal"
            style={{ fontFamily: "'Zen Kaku Gothic New', var(--font-display)" }}
          >
            三
          </span>
          <h1 className="text-lg font-bold tracking-tight">Third Time</h1>
        </div>
        <div className="flex items-center gap-1">
          <SyncIndicator />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="press flex size-11 cursor-pointer items-center justify-center rounded-full border border-border text-text hover:border-border-strong"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="8" cy="17" r="2" />
            </svg>
          </button>
        </div>
      </header>

      <InstallHint />
      <TimerPanel onFix={() => setFixing(true)} />
      <ItemsView view={view} />

      <nav
        aria-label="Views"
        className="fixed left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[22rem] -translate-x-1/2 gap-1.5 rounded-full border border-border-strong/40 bg-bg p-1.5"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            onClick={() => setView(v.value)}
            className={`press flex-1 min-h-12 cursor-pointer rounded-full text-[0.9375rem] font-bold transition-colors ${
              view === v.value ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text'
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {fixing && <FixTimerModal onClose={() => setFixing(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
