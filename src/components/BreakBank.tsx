import { useEffect, useRef, useState } from 'react';
import { formatTimeLong, isInDebt, earnBreak } from '../utils/thirdTime';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { playSound } from '../utils/sounds';

type BreakMode = null | 'picker' | 'open' | 'timed';

export function BreakBank() {
  const { timerState, timerStart, daily, startBreak } = useSession();
  const { mode, soundsEnabled } = useSettings();
  const [, tick] = useState(0);
  const [breakMode, setBreakMode] = useState<BreakMode>(null);
  const [timedBreakMs, setTimedBreakMs] = useState<number | null>(null);
  const [showDebtPrompt, setShowDebtPrompt] = useState(false);

  const firedOneMin = useRef(false);
  const firedBankEmpty = useRef(false);
  const firedBreakEnd = useRef(false);

  useEffect(() => {
    if (timerState === 'idle') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timerState]);

  // Reset state and sound guards when break ends
  useEffect(() => {
    if (timerState === 'on-break') {
      firedOneMin.current = false;
      firedBankEmpty.current = false;
      firedBreakEnd.current = false;
    }
    if (timerState !== 'on-break') {
      setBreakMode(null);
      setTimedBreakMs(null);
    }
  }, [timerState]);

  const elapsed = timerStart ? Date.now() - timerStart : 0;

  const liveBank =
    timerState === 'working'
      ? daily.bankMs + earnBreak(elapsed, mode)
      : timerState === 'on-break'
      ? daily.bankMs - elapsed
      : daily.bankMs;

  const displaySeconds = Math.floor(Math.abs(liveBank) / 1000);
  const isZero = displaySeconds === 0;
  const debt = isInDebt(liveBank) && !isZero;

  // Sound triggers while on break
  useEffect(() => {
    if (timerState !== 'on-break' || !soundsEnabled) return;
    if (liveBank <= 60_000 && liveBank > 0 && !firedOneMin.current) {
      firedOneMin.current = true;
      playSound('one-minute');
    }
    if (liveBank <= 0 && !firedBankEmpty.current) {
      firedBankEmpty.current = true;
      playSound('bank-empty');
    }
    if (timedBreakMs !== null && elapsed >= timedBreakMs && !firedBreakEnd.current) {
      firedBreakEnd.current = true;
      playSound('break-end');
    }
  }, [elapsed, liveBank, timerState, timedBreakMs, soundsEnabled]);

  const handleBreakClick = () => {
    const projectedBank =
      timerState === 'working' ? daily.bankMs + earnBreak(elapsed, mode) : daily.bankMs;
    if (projectedBank <= 0) {
      setShowDebtPrompt(true);
      return;
    }
    setBreakMode('picker');
  };

  const handleStartOpenBreak = () => {
    setBreakMode('open');
    startBreak(mode);
  };

  const handleStartTimedBreak = (ms: number) => {
    setTimedBreakMs(ms);
    setBreakMode('timed');
    startBreak(mode);
  };

  const bankForPicker = liveBank > 0 ? liveBank : 0;
  const breakOptions = [5 * 60_000, 10 * 60_000].filter((ms) => ms <= bankForPicker);

  const isOnBreak = timerState === 'on-break';

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 shadow-sm transition-all border ${
      debt
        ? 'bg-red-50 dark:bg-red-950/20 border-red-200/80 dark:border-red-800/40'
        : isOnBreak
        ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40'
        : 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200/60 dark:border-emerald-800/30'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Rest
        </span>
        {isOnBreak && !debt && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Resting
          </span>
        )}
        {debt && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-red-500 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            In debt
          </span>
        )}
      </div>

      {/* Bank balance display */}
      <div className="text-center py-3">
        <div className={`text-4xl font-mono font-bold tabular-nums tracking-tight ${
          isZero
            ? 'text-gray-500 dark:text-gray-400'
            : debt
            ? 'text-red-600 dark:text-red-400'
            : 'text-emerald-700 dark:text-emerald-400'
        }`}>
          {debt ? '-' : ''}{formatTimeLong(Math.abs(liveBank))}
        </div>
      </div>

      {/* Timed break countdown */}
      {timerState === 'on-break' && breakMode === 'timed' && timedBreakMs !== null && (
        <div className="text-center text-xs text-gray-400">
          Selected: <span className="font-semibold">{formatTimeLong(timedBreakMs)}</span>
          {elapsed >= timedBreakMs && (
            <span className="ml-2 text-orange-500 font-semibold">&mdash; time&apos;s up!</span>
          )}
        </div>
      )}

      {/* Debt prompt */}
      {showDebtPrompt && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            You don&apos;t have any rest time. Is this important?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowDebtPrompt(false); setBreakMode('open'); startBreak(mode); }}
              className="flex-1 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 font-medium transition-colors"
            >
              Rest Anyway
            </button>
            <button
              onClick={() => setShowDebtPrompt(false)}
              className="flex-1 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
            >
              Keep Going
            </button>
          </div>
        </div>
      )}

      {/* Break picker */}
      {breakMode === 'picker' && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-center text-gray-400">How long?</div>
          <div className="flex gap-2 flex-wrap justify-center">
            {breakOptions.map((ms) => (
              <button
                key={ms}
                onClick={() => handleStartTimedBreak(ms)}
                className="px-4 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-semibold hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
              >
                {ms / 60_000} min
              </button>
            ))}
            <button
              onClick={() => handleStartTimedBreak(bankForPicker)}
              className="px-4 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-semibold hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
            >
              All ({formatTimeLong(bankForPicker)})
            </button>
            <button
              onClick={handleStartOpenBreak}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Open
            </button>
          </div>
          <button
            onClick={() => setBreakMode(null)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-center"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Break button — shown when working and not showing picker/debt prompt */}
      {!showDebtPrompt && breakMode === null && timerState === 'working' && (
        <button
          onClick={handleBreakClick}
          className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 transition-colors"
        >
          Rest
        </button>
      )}
    </div>
  );
}
