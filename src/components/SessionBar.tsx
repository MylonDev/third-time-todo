import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { formatTimeLong, isInDebt, earnBreak, MODE_CONFIG } from '../utils/thirdTime';
import type { Mode } from '../types';

const MODE_COLOR: Record<Mode, string> = {
  quarter: 'var(--color-mode-quarter)',
  third: 'var(--color-mode-third)',
  half: 'var(--color-mode-half)',
};

/**
 * Compact clock that takes over once the full session panels scroll away, so the
 * elapsed time, the bank and the Rest button stay reachable from the task list.
 * Only needed on narrow screens — above `lg` the panels live in a sticky rail.
 */
export function SessionBar({ visible }: { visible: boolean }) {
  const { timerState, timerStart, daily, startBreak, stopBreak, startWork } = useSession();
  const { mode } = useSettings();
  // Elapsed is held in state and advanced by the interval, rather than read from
  // Date.now() during render.
  const [elapsed, setElapsed] = useState(() => (timerStart ? Date.now() - timerStart : 0));

  useEffect(() => {
    if (timerState === 'idle') return;
    const id = setInterval(
      () => setElapsed(timerStart ? Date.now() - timerStart : 0),
      1000
    );
    return () => clearInterval(id);
  }, [timerState, timerStart]);

  const show = visible && timerState !== 'idle';
  const isWorking = timerState === 'working';
  const modeColor = MODE_COLOR[mode as Mode];

  const liveBank = isWorking
    ? daily.bankMs + earnBreak(elapsed, mode)
    : daily.bankMs - elapsed;
  const debt = isInDebt(liveBank);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="session-bar"
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -56, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-40 lg:hidden border-b backdrop-blur-md"
          style={{
            background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="max-w-[760px] mx-auto flex items-center gap-3 px-4 py-2">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                background: isWorking ? modeColor : 'var(--color-rest)',
                animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
              }}
            />
            <span
              className="font-timer text-base font-bold"
              style={{ color: isWorking ? modeColor : 'var(--color-rest)' }}
            >
              {formatTimeLong(elapsed)}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {isWorking ? MODE_CONFIG[mode as Mode].label : 'Resting'}
            </span>

            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Bank
              </span>
              <span
                className="font-timer text-sm font-bold"
                style={{ color: debt ? 'var(--color-debt)' : 'var(--color-rest)' }}
              >
                {debt ? '-' : ''}
                {formatTimeLong(Math.abs(liveBank))}
              </span>
            </span>

            {isWorking ? (
              <button
                onClick={() => startBreak(mode)}
                className="px-3 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
                style={{ background: 'var(--color-rest)', color: 'var(--color-bg)' }}
              >
                Rest
              </button>
            ) : (
              <button
                onClick={() => { stopBreak(); startWork(); }}
                className="px-3 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
                style={{ background: modeColor, color: 'var(--color-bg)' }}
              >
                Resume
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
