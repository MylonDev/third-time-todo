import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BreakBank } from './components/BreakBank';
import { SessionTimer } from './components/SessionTimer';
import { TaskList } from './components/TaskList';
import { HabitList } from './components/HabitList';
import { GoalList } from './components/GoalList';
import { Activity } from './components/Activity';
import { ModeSelector } from './components/ModeSelector';
import { OptionsPanel } from './components/OptionsPanel';
import { EndSessionModal } from './components/EndSessionModal';
import { RestoreSessionModal } from './components/RestoreSessionModal';
import { CarriedOverModal } from './components/CarriedOverModal';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { useTasks } from './store/tasks';
import { requestNotificationPermission } from './utils/notifications';
import { earnBreak, todayKey } from './utils/thirdTime';
import type { TabId } from './types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'habits', label: 'Habits' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'goals', label: 'Goals' },
  { id: 'activity', label: 'Activity' },
];

export default function App() {
  const {
    timerState, timerStart, sessionClosedAt, setClosedAt, clearTimer,
    focusedItem, setFocusSegmentStart, pruneFocus, maybeArchivePreviousDay,
  } = useSession();
  const { theme, mode, activeTab, setActiveTab, quotes, showQuote, setShowQuote } = useSettings();
  const { rolloverPastTasks } = useTasks();

  // Tasks that came over from a previous day on this open. Offered for triage
  // once — they have already been moved, so dismissing is a valid answer.
  const [carriedOver, setCarriedOver] = useState<string[]>([]);

  // Close out a day that ended while the app was away, then roll unfinished
  // tasks into today.
  useEffect(() => {
    maybeArchivePreviousDay();
    // Only ever widen the list — under StrictMode this runs twice, and the
    // second pass finds nothing left to move.
    const carried = rolloverPastTasks();
    if (carried.length > 0) setCarriedOver(carried);
    pruneFocus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showOptions, setShowOptions] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [bankToClear, setBankToClear] = useState(0);

  // Sample the bank as the modal opens so the summary can report the rest this
  // session leaves unspent. Includes what the running timer has earned but not banked.
  const handleOpenEndModal = () => {
    const { daily, timerStart: start, timerState: state } = useSession.getState();
    const elapsed = start ? Date.now() - start : 0;
    setBankToClear(
      state === 'working'
        ? daily.bankMs + earnBreak(elapsed, mode)
        : state === 'on-break'
        ? daily.bankMs - elapsed
        : daily.bankMs
    );
    setShowEndModal(true);
  };

  // Show restore modal if a session was active when the page last closed
  const [showRestoreModal] = useState(() => useSession.getState().timerState !== 'idle');

  // Record when the page went away so the session can be restored. `pagehide`
  // and `visibilitychange` fire reliably on mobile, where `beforeunload` does not.
  useEffect(() => {
    const record = () => {
      if (useSession.getState().timerState !== 'idle') {
        useSession.getState().setClosedAt(Date.now());
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') record(); };
    window.addEventListener('pagehide', record);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', record);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // A tab left open across midnight keeps yesterday's task list; re-run rollover
  // as the day turns.
  const [dayKey, setDayKey] = useState(() => todayKey());
  useEffect(() => {
    const next = new Date();
    next.setHours(24, 0, 0, 500);
    const id = setTimeout(() => {
      maybeArchivePreviousDay();
      const carried = rolloverPastTasks();
      if (carried.length > 0) setCarriedOver(carried);
      setDayKey(todayKey());
    }, next.getTime() - Date.now());
    return () => clearTimeout(id);
  }, [dayKey, rolloverPastTasks, maybeArchivePreviousDay]);

  // Restore handlers
  const [restoreModalDismissed, setRestoreModalDismissed] = useState(false);

  const handleRestoreReset = () => {
    clearTimer();
    setRestoreModalDismissed(true);
  };

  const handleRestoreContinue = () => {
    const closedAt = sessionClosedAt ?? Date.now();
    const elapsedAtClose = timerStart ? closedAt - timerStart : 0;
    const resumedStart = Date.now() - elapsedAtClose;
    useSession.setState({ timerStart: resumedStart, sessionClosedAt: null });
    if (focusedItem) setFocusSegmentStart(resumedStart);
    setRestoreModalDismissed(true);
  };

  const handleRestoreResume = () => {
    setClosedAt(null);
    if (focusedItem && timerStart) setFocusSegmentStart(timerStart);
    setRestoreModalDismissed(true);
  };

  const closedAt = sessionClosedAt ?? Date.now();
  const elapsedAtClose = timerStart ? closedAt - timerStart : 0;
  const timeAway = sessionClosedAt ? Date.now() - sessionClosedAt : 0;

  // Apply theme: dark is default, .light class overrides
  useEffect(() => {
    const apply = (dark: boolean) => {
      document.documentElement.classList.toggle('light', !dark);
    };
    if (theme === 'dark') { apply(true); return; }
    if (theme === 'light') { apply(false); return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const handleStart = () => {
    requestNotificationPermission();
    useSession.getState().startWork();
  };

  const sessionActive = timerState !== 'idle';
  const quote = showQuote && quotes.length > 0 ? quotes[0] : null;

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: 'transparent' }}>
      <motion.div
        className="mx-auto w-full max-w-[980px] flex flex-col gap-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-deep) 100%)' }}
            >
              <span className="text-white text-sm font-bold select-none" style={{ fontFamily: 'var(--font-mono)' }}>
                ⅓
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
                Third Time
              </h1>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Work freely. Earn your breaks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AnimatePresence>
              {sessionActive && (
                <motion.button
                  key="end-session"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  onClick={handleOpenEndModal}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: 'var(--color-danger-dim)',
                    color: 'var(--color-danger)',
                    border: '1px solid var(--color-danger)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  End Session
                </motion.button>
              )}
            </AnimatePresence>
            <button
              onClick={() => setShowOptions(true)}
              className="p-2 rounded-xl border transition-opacity opacity-50 hover:opacity-100"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
              title="Options"
              aria-label="Options"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        {/* ── Pinned session zone ─────────────────────────────── */}
        <section className="flex flex-col gap-3">
          {!sessionActive ? (
            <>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
                <div className="flex-1">
                  <ModeSelector locked={false} />
                </div>
                <button
                  onClick={handleStart}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all sm:w-auto"
                  style={{
                    background: `var(--color-mode-${mode})`,
                    color: 'var(--color-bg)',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.02em',
                  }}
                >
                  Start →
                </button>
              </div>
              {quote && (
                <div
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px]"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
                >
                  <span className="flex-1">“{quote}”</span>
                  <button
                    onClick={() => setShowQuote(false)}
                    aria-label="Hide the quote"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SessionTimer />
              <BreakBank />
            </div>
          )}
        </section>

        {/* ── Tabs ────────────────────────────────────────────── */}
        <div
          className="flex gap-6 border-b"
          style={{ borderColor: 'var(--color-border)' }}
          role="tablist"
          aria-label="Sections"
        >
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className="pb-2.5 -mb-px border-b-2 text-sm font-semibold transition-colors"
                style={{
                  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                  borderColor: active ? 'var(--color-accent)' : 'transparent',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Active panel ────────────────────────────────────── */}
        <motion.main
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {activeTab === 'habits' && <HabitList />}
          {activeTab === 'tasks' && <TaskList />}
          {activeTab === 'goals' && <GoalList />}
          {activeTab === 'activity' && <Activity />}
        </motion.main>
      </motion.div>

      {/* ── Overlays ─────────────────────────────────────────── */}
      <OptionsPanel isOpen={showOptions} onClose={() => setShowOptions(false)} />

      {showRestoreModal && !restoreModalDismissed && timerState !== 'idle' && (
        <RestoreSessionModal
          timerState={timerState as 'working' | 'on-break'}
          elapsedAtClose={elapsedAtClose}
          timeAway={timeAway}
          onReset={handleRestoreReset}
          onContinue={handleRestoreContinue}
          onResume={handleRestoreResume}
        />
      )}

      <AnimatePresence>
        {carriedOver.length > 0 && (
          <CarriedOverModal taskIds={carriedOver} onClose={() => setCarriedOver([])} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEndModal && (
          <EndSessionModal
            isOpen={showEndModal}
            onClose={() => setShowEndModal(false)}
            mode={mode}
            bankToClear={bankToClear}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
