import { useEffect, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { BreakBank } from './components/BreakBank';
import { SessionTimer } from './components/SessionTimer';
import { TaskList } from './components/TaskList';
import { RecentBlocks } from './components/RecentBlocks';
import { StaleTaskAlert } from './components/StaleTaskAlert';
import { ModeSelector } from './components/ModeSelector';
import { OptionsPanel } from './components/OptionsPanel';
import { EndSessionModal } from './components/EndSessionModal';
import { useSession } from './store/session';
import { useSettings } from './store/settings';
import { requestNotificationPermission } from './utils/notifications';


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
  const { timerState } = useSession();
  const { theme, mode } = useSettings();
  const [showOptions, setShowOptions] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);

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

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ background: 'transparent' /* body handles bg */ }}
    >
      <motion.div
        className="max-w-2xl mx-auto flex flex-col gap-5"
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
                background: 'linear-gradient(135deg, var(--color-accent) 0%, #4c1d95 100%)',
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
                  onClick={() => setShowEndModal(true)}
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

        {/* ── Session Controls Row ─────────────────────────────── */}
        <motion.div
          variants={item}
          className="flex items-center gap-3 flex-wrap"
        >
          <ModeSelector locked={isLocked} />
          <AnimatePresence>
            {!sessionActive && (
              <motion.button
                key="start"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onClick={handleStart}
                className="px-5 py-2 rounded-xl font-bold text-sm transition-all ml-auto"
                style={{
                  background: 'var(--color-mode-third)',
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

        {/* ── Timer Panels (only when active) ──────────────────── */}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SessionTimer />
                <BreakBank />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stale Task Alert ─────────────────────────────────── */}
        <motion.div variants={item}>
          <StaleTaskAlert />
        </motion.div>

        {/* ── Tasks ────────────────────────────────────────────── */}
        <motion.section variants={item}>
          <div
            className="text-[13px] font-semibold uppercase tracking-wider mb-2"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}
          >
            Tasks
          </div>
          <div
            className="rounded-2xl border p-4"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <TaskList />
          </div>
        </motion.section>

        {/* ── Recent Blocks ────────────────────────────────────── */}
        <motion.div variants={item}>
          <RecentBlocks />
        </motion.div>

      </motion.div>

      {/* ── Overlays ─────────────────────────────────────────── */}
      <OptionsPanel isOpen={showOptions} onClose={() => setShowOptions(false)} />

      <AnimatePresence>
        {showEndModal && (
          <EndSessionModal
            isOpen={showEndModal}
            onClose={() => setShowEndModal(false)}
            mode={mode}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
