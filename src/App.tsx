import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { BreakBank } from './components/BreakBank';
import { SessionTimer } from './components/SessionTimer';
import { TaskList } from './components/TaskList';
import { GoalList } from './components/GoalList';
import { Activity } from './components/Activity';
import { ModeSelector } from './components/ModeSelector';
import { OptionsPanel } from './components/OptionsPanel';
import { EndSessionModal } from './components/EndSessionModal';
import { RestoreSessionModal } from './components/RestoreSessionModal';
import { SessionBar } from './components/SessionBar';
import { RoutinesModal } from './components/RoutinesModal';
import { RoutinePanel } from './components/RoutinePanel';
import { CollapsibleSection } from './components/CollapsibleSection';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { useTasks, usePendingRoutines } from './store/tasks';
import { requestNotificationPermission } from './utils/notifications';
import { earnBreak, formatDuration, todayKey } from './utils/thirdTime';


// Animation variants for staggered section entrance
const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

export default function App() {
  const {
    timerState, timerStart, sessionClosedAt, setClosedAt, clearTimer,
    focusedItem, setFocusSegmentStart, pruneFocus,
  } = useSession();
  const { theme, mode, collapsedSections, toggleSection } = useSettings();
  const { rolloverPastTasks, tasks, spawnDueRoutines, routines } = useTasks();
  const pendingRoutines = usePendingRoutines();

  // Roll unfinished tasks from past days into today, then add anything the
  // routines owe today.
  useEffect(() => {
    rolloverPastTasks();
    spawnDueRoutines();
    pruneFocus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showOptions, setShowOptions] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showRoutines, setShowRoutines] = useState(false);
  const [bankToClear, setBankToClear] = useState(0);

  // Sample the bank as the modal opens so it can warn about what ending the day
  // will destroy. Includes the rest the running timer has earned but not banked.
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
  const [showRestoreModal] = useState(() => {
    const state = useSession.getState();
    return state.timerState !== 'idle';
  });

  // Record when the page went away so the session can be restored. `pagehide`
  // and `visibilitychange` fire reliably on mobile, where `beforeunload` does
  // not — and neither of them raises a "Leave site?" dialog on every close.
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

  // A tab left open across midnight keeps yesterday's task list and checklist
  // ticks, because rollover only runs on mount. Re-run it as the day turns.
  const [dayKey, setDayKey] = useState(() => todayKey());
  useEffect(() => {
    const next = new Date();
    next.setHours(24, 0, 0, 500);
    const id = setTimeout(() => {
      rolloverPastTasks();
      spawnDueRoutines();
      setDayKey(todayKey());
    }, next.getTime() - Date.now());
    return () => clearTimeout(id);
  }, [dayKey, rolloverPastTasks, spawnDueRoutines]);

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
    // Time away is discarded, so the focus segment restarts from the same point
    // the session timer does.
    if (focusedItem) setFocusSegmentStart(resumedStart);
    setRestoreModalDismissed(true);
  };

  const handleRestoreResume = () => {
    setClosedAt(null);
    // Time away counts as active, so the whole session — including the part that
    // ran before the tab closed — belongs to the focused item.
    if (focusedItem && timerStart) setFocusSegmentStart(timerStart);
    setRestoreModalDismissed(true);
  };

  // Compute restore modal props
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
    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const handleStart = () => {
    requestNotificationPermission();
    const { startWork } = useSession.getState();
    startWork();
  };

  const sessionActive = timerState !== 'idle';
  const isLocked = sessionActive;

  // Status line under the Tasks heading — what the section is worth at a glance.
  const taskSummary = useMemo(() => {
    const today = todayKey();
    // Routine steps have their own panel, so they are not counted here.
    const todays = tasks.filter((t) => t.scheduledDate === today && !t.routineId);
    if (todays.length === 0) return '';
    const done = todays.filter((t) => t.status === 'done').length;
    const trackedMs = todays.reduce((a, t) => a + (t.trackedMs ?? 0), 0);
    const parts = [`${done} of ${todays.length} done`];
    if (trackedMs > 0) parts.push(`${formatDuration(trackedMs)} tracked`);
    return parts.join(' · ');
  // dayKey re-derives the summary when the date rolls over under an open tab
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, dayKey]);

  // Watch a sentinel below the session panels: once it scrolls out of view the
  // compact bar takes over, so the clock is never more than a glance away.
  const sessionSentinelRef = useRef<HTMLDivElement>(null);
  const [sessionScrolledAway, setSessionScrolledAway] = useState(false);
  useEffect(() => {
    const el = sessionSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setSessionScrolledAway(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ background: 'transparent' /* body handles bg */ }}
    >
      <motion.div
        className="mx-auto w-full max-w-[760px] lg:max-w-[1160px] flex flex-col gap-5"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <motion.header variants={item} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-deep) 100%)',
              }}
            >
              <span
                className="text-white text-sm font-bold select-none"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                ⅓
              </span>
            </div>
            <div>
              <h1
                className="text-lg font-bold tracking-tight leading-none"
                style={{ color: 'var(--color-text)' }}
              >
                Third Time
              </h1>
              <p
                className="text-[13px] mt-0.5"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Work freely. Earn your breaks.
              </p>
            </div>
          </div>

          {/* Header controls */}
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
                  End Day
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
        </motion.header>

        {/* Everything below the header splits into a working column and a
            session rail on wide screens. On narrow screens the rail comes
            first, so the clock and the mode picker stay above the lists. */}
        <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start gap-5">

          {/* ── Working column ─────────────────────────────────── */}
          <main className="order-2 lg:order-1 min-w-0 flex flex-col gap-5">

            {/* Routines and Tasks are parallel sections, each collapsible, so a
                recurring block is never mixed into the list you curate. The
                section stays put when there are no routines, the way Tasks and
                Goals do — a section that disappears takes its own way back in
                with it. */}
            <motion.div variants={item}>
              <CollapsibleSection
                label="Routines"
                collapsed={!!collapsedSections.routines}
                onToggle={() => toggleSection('routines')}
                summary={
                  routines.length === 0
                    ? 'none yet'
                    : pendingRoutines.length === 0
                    ? 'all done for now'
                    : `${pendingRoutines.length} outstanding`
                }
                action={
                  <button
                    onClick={() => setShowRoutines(true)}
                    className="text-xs font-semibold transition-opacity opacity-70 hover:opacity-100"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    Manage
                  </button>
                }
              >
                <RoutinePanel />
              </CollapsibleSection>
            </motion.div>

            <motion.div variants={item}>
              <CollapsibleSection
                label="Tasks"
                prominent
                collapsed={!!collapsedSections.tasks}
                onToggle={() => toggleSection('tasks')}
                summary={taskSummary}
              >
                <TaskList />
              </CollapsibleSection>
            </motion.div>

            {/* Goals */}
            <motion.div variants={item}>
              <CollapsibleSection
                label="Goals"
                collapsed={!!collapsedSections.goals}
                onToggle={() => toggleSection('goals')}
              >
                <GoalList />
              </CollapsibleSection>
            </motion.div>
          </main>

          {/* ── Session rail ───────────────────────────────────── */}
          <aside className="order-1 lg:order-2 min-w-0 flex flex-col gap-4 lg:sticky lg:top-6">
            <motion.div variants={item} className="flex flex-col gap-3">
              <ModeSelector locked={isLocked} />
              <AnimatePresence>
                {!sessionActive && (
                  <motion.button
                    key="start"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    onClick={handleStart}
                    className="w-full px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
                    style={{
                      background: `var(--color-mode-${mode})`,
                      color: 'var(--color-bg)',
                      fontFamily: 'var(--font-display)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    Start →
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            <AnimatePresence>
              {sessionActive && (
                <motion.div
                  key="timer-panels"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                    <SessionTimer />
                    <BreakBank />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sentinel: once this scrolls past, the compact bar takes over */}
            <div ref={sessionSentinelRef} aria-hidden="true" className="h-px -mt-4" />
          </aside>
        </div>

        {/* Activity spans the full width — it is a chart, not a sidebar widget,
            and it belongs at the end of the page on every breakpoint. */}
        <motion.div variants={item}>
          <Activity />
        </motion.div>

      </motion.div>

      <SessionBar visible={sessionScrolledAway} />

      <RoutinesModal isOpen={showRoutines} onClose={() => setShowRoutines(false)} />

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
