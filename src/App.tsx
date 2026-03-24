import { useEffect, useState } from 'react';
import { BreakBank } from './components/BreakBank';
import { SessionTimer } from './components/SessionTimer';
import { TaskList } from './components/TaskList';
import { DailyView } from './components/DailyView';
import { DailyOnboarding } from './components/DailyOnboarding';
import { OptionsPanel } from './components/OptionsPanel';
import { EndSessionModal } from './components/EndSessionModal';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { todayKey } from './utils/thirdTime';
import { requestNotificationPermission } from './utils/notifications';

export default function App() {
  const { daily, timerState } = useSession();
  const { theme, mode } = useSettings();
  const [sessionStarted, setSessionStarted] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);

  // Apply theme to document root
  useEffect(() => {
    const apply = (dark: boolean) => {
      document.documentElement.classList.toggle('dark', dark);
    };
    if (theme === 'dark') { apply(true); return; }
    if (theme === 'light') { apply(false); return; }
    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // If a session is already running (e.g., browser reload), skip onboarding
  useEffect(() => {
    if (timerState !== 'idle') {
      setSessionStarted(true);
    }
  }, [timerState]);

  const isNewDay = daily.date !== todayKey();
  const showOnboarding = !sessionStarted && (isNewDay || daily.sessions.length === 0);

  const handleStart = () => {
    requestNotificationPermission();
    const { startWork } = useSession.getState();
    startWork();
    setSessionStarted(true);
  };

  const sessionActive = timerState !== 'idle';

  if (showOnboarding) {
    return (
      <>
        <DailyOnboarding onStart={handleStart} />
        <OptionsPanel isOpen={showOptions} onClose={() => setShowOptions(false)} />
        <button
          onClick={() => setShowOptions(true)}
          className="fixed top-4 right-4 z-30 p-2 rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shadow-sm transition-colors"
          title="Options"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 transition-colors">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold">&#x2153;</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">Third Time</h1>
              <p className="text-[11px] text-gray-400">Work freely. Earn your breaks.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessionActive && (
              <button
                onClick={() => setShowEndModal(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                End Session
              </button>
            )}
            <button
              onClick={() => setShowOptions(true)}
              className="p-2 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-white dark:bg-gray-900 shadow-sm transition-colors"
              title="Options"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Panels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SessionTimer />
          <BreakBank />
        </div>

        {/* Tasks */}
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Tasks
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <TaskList />
          </div>
        </section>

        {/* Daily log */}
        <DailyView />
      </div>

      <OptionsPanel isOpen={showOptions} onClose={() => setShowOptions(false)} />
      <EndSessionModal
        isOpen={showEndModal}
        onClose={() => setShowEndModal(false)}
        mode={mode}
      />
    </div>
  );
}
