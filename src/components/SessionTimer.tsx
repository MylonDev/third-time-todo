import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { formatTimeLong, MODE_CONFIG, MODE_BADGE_CLASSES } from '../utils/thirdTime';
import { playSound } from '../utils/sounds';
import { sendNotification } from '../utils/notifications';
import type { Mode } from '../types';

const MODE_COLOR: Record<Mode, string> = {
  quarter: 'var(--color-mode-quarter)',
  third:   'var(--color-mode-third)',
  half:    'var(--color-mode-half)',
};
const MODE_COLOR_DIM: Record<Mode, string> = {
  quarter: 'var(--color-mode-quarter-dim)',
  third:   'var(--color-mode-third-dim)',
  half:    'var(--color-mode-half-dim)',
};

export function SessionTimer() {
  const { timerState, timerStart, stopBreak, startWork } = useSession();
  const { mode, longWorkReminderMin, soundsEnabled } = useSettings();
  const [, tick] = useState(0);
  const [reminderDismissedAt, setReminderDismissedAt] = useState<number | null>(null);
  const firedReminder = useRef(false);

  useEffect(() => {
    if (timerState === 'idle') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timerState]);

  const elapsed = timerState === 'working' && timerStart ? Date.now() - timerStart : 0;
  const modeCfg = MODE_CONFIG[mode as Mode];

  const showWorkReminder =
    timerState === 'working' &&
    elapsed >= longWorkReminderMin * 60_000 &&
    (reminderDismissedAt === null || elapsed - reminderDismissedAt >= longWorkReminderMin * 60_000);

  useEffect(() => {
    if (showWorkReminder && !firedReminder.current) {
      firedReminder.current = true;
      if (soundsEnabled) playSound('work-reminder');
      sendNotification(
        'Activity Reminder',
        `You've been active for ${Math.floor(elapsed / 60_000)} min. Consider a rest.`
      );
    }
  }, [showWorkReminder, elapsed, soundsEnabled]);

  const handleResumeWork = () => {
    stopBreak();
    startWork();
  };

  const isWorking = timerState === 'working';
  const isOnBreak = timerState === 'on-break';

  return (
    <motion.div
      key={timerState}
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all"
      style={{
        background: isWorking ? MODE_COLOR_DIM[mode as Mode] : 'var(--color-surface)',
        border: `1px solid ${isWorking ? MODE_COLOR[mode as Mode] : 'var(--color-border)'}`,
        boxShadow: 'none',
      }}
      initial={{ scale: 0.98, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className="text-[13px] font-semibold uppercase tracking-wider"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--color-text-muted)',
          }}
        >
          Active Time
        </span>
        {isWorking && (
          <span
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: MODE_COLOR[mode as Mode] }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: MODE_COLOR[mode as Mode] }}
            />
            Active
          </span>
        )}
        {isOnBreak && (
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}
          >
            On Rest
          </span>
        )}
      </div>

      {/* Long work reminder */}
      {showWorkReminder && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
          style={{
            background: MODE_COLOR_DIM[mode as Mode],
            border: `1px solid ${MODE_COLOR[mode as Mode]}`,
            color: MODE_COLOR[mode as Mode],
          }}
        >
          <span>
            You&apos;ve been active for {Math.floor(elapsed / 60_000)} min. Consider a rest.
          </span>
          <button
            className="ml-auto opacity-60 hover:opacity-100 transition-opacity"
            onClick={() => {
              setReminderDismissedAt(elapsed);
              firedReminder.current = false;
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Timer display */}
      <div className="text-center py-3">
        <div
          className="font-timer text-4xl font-bold"
          style={{
            color: isWorking ? MODE_COLOR[mode as Mode] : 'var(--color-text)',
          }}
        >
          {formatTimeLong(elapsed)}
        </div>
        <span
          className={`inline-flex text-[13px] font-semibold px-2.5 py-0.5 rounded-md mt-2 ${MODE_BADGE_CLASSES[mode as Mode]}`}
        >
          {modeCfg.label} &middot; 1:{modeCfg.ratio}
        </span>
      </div>

      {/* Resume button (on-break only) */}
      {isOnBreak && (
        <button
          onClick={handleResumeWork}
          className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: MODE_COLOR[mode as Mode],
            color: 'var(--color-bg)',
            fontFamily: 'var(--font-display)',
          }}
        >
          Resume
        </button>
      )}
    </motion.div>
  );
}
