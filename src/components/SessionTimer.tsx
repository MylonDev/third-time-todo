import { useEffect, useState } from 'react';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { formatTimeLong, MODE_CONFIG } from '../utils/thirdTime';
import type { Mode } from '../types';

const MODE_BADGE: Record<Mode, string> = {
  quarter: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  third: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  half: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
};

export function SessionTimer() {
  const { timerState, timerStart, startWork, stopBreak } = useSession();
  const { mode, longWorkReminderMin } = useSettings();
  const [, tick] = useState(0);
  const [reminderDismissedAt, setReminderDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (timerState === 'idle') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timerState]);

  const elapsed = timerState === 'working' && timerStart ? Date.now() - timerStart : 0;
  const modeCfg = MODE_CONFIG[mode];

  const showWorkReminder =
    timerState === 'working' &&
    elapsed >= longWorkReminderMin * 60_000 &&
    (reminderDismissedAt === null || elapsed - reminderDismissedAt >= longWorkReminderMin * 60_000);

  const handleResumeWork = () => {
    stopBreak();
    startWork();
  };

  const isWorking = timerState === 'working';
  const isOnBreak = timerState === 'on-break';

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 shadow-sm transition-all ${
      isWorking
        ? 'bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/40'
        : isOnBreak
        ? 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50'
        : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Active Time
        </span>
        {isWorking && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Active
          </span>
        )}
        {isOnBreak && (
          <span className="text-[10px] font-medium text-gray-400">On Rest</span>
        )}
      </div>

      {/* Long work reminder */}
      {showWorkReminder && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span>You&apos;ve been active for {Math.floor(elapsed / 60_000)} min. Consider a rest.</span>
          <button
            className="ml-auto text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
            onClick={() => setReminderDismissedAt(elapsed)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Timer display */}
      <div className="text-center py-3">
        <div className={`text-4xl font-mono font-bold tabular-nums tracking-tight ${
          isWorking ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-800 dark:text-gray-100'
        }`}>
          {formatTimeLong(elapsed)}
        </div>
        <span className={`inline-flex text-[11px] font-semibold px-2.5 py-0.5 rounded-md mt-2 ${MODE_BADGE[mode]}`}>
          {modeCfg.label} &middot; 1:{modeCfg.ratio}
        </span>
      </div>

      {/* Action buttons */}
      {timerState === 'idle' && (
        <button
          onClick={startWork}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors"
        >
          Start
        </button>
      )}
      {timerState === 'on-break' && (
        <button
          onClick={handleResumeWork}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 transition-colors"
        >
          Resume
        </button>
      )}
    </div>
  );
}
