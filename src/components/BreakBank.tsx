import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatTimeLong, isInDebt, earnBreak } from '../utils/thirdTime';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { playSound } from '../utils/sounds';
import { sendNotification } from '../utils/notifications';

type BreakMode = null | 'picker' | 'open' | 'timed';

export function BreakBank() {
  const { timerState, timerStart, daily, startBreak } = useSession();
  const { mode, soundsEnabled, breakIncrements, lastBreakMs, setLastBreakMs } = useSettings();
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
      sendNotification('Rest time up!', 'Your rest has ended. Ready to get back to it?');
    }
  }, [elapsed, liveBank, timerState, timedBreakMs, soundsEnabled]);

  const isOnBreak = timerState === 'on-break';

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
    setLastBreakMs(ms);
    startBreak(mode);
  };

  const bankForPicker = liveBank > 0 ? liveBank : 0;
  const breakOptions = breakIncrements
    .map((m) => m * 60_000)
    .filter((ms) => ms <= bankForPicker);

  const cardStyle: React.CSSProperties = debt
    ? { background: 'var(--color-debt-dim)', borderColor: 'rgba(248,113,113,0.3)' }
    : isOnBreak
    ? { background: 'var(--color-rest-dim)', borderColor: 'rgba(52,211,153,0.25)' }
    : { background: 'var(--color-surface)', borderColor: 'var(--color-border)' };

  return (
    <motion.div
      key={timerState}
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all border"
      style={cardStyle}
      initial={{ scale: 0.98, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className="text-[13px] font-semibold uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}
        >
          Rest
        </span>
        {isOnBreak && !debt && (
          <span
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-rest)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--color-rest)' }}
            />
            Resting
          </span>
        )}
        {debt && (
          <span
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-debt)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--color-debt)' }}
            />
            In debt
          </span>
        )}
      </div>

      {/* Bank balance */}
      <div className="text-center py-3">
        <div
          className="font-timer text-4xl font-bold"
          style={{
            color: isZero
              ? 'var(--color-text-muted)'
              : debt
              ? 'var(--color-debt)'
              : 'var(--color-rest)',
          }}
        >
          {debt ? '-' : ''}{formatTimeLong(Math.abs(liveBank))}
        </div>
      </div>

      {/* Timed break countdown */}
      {isOnBreak && breakMode === 'timed' && timedBreakMs !== null && (
        <div
          className="text-center text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Selected:{' '}
          <span className="font-semibold" style={{ color: 'var(--color-rest)' }}>
            {formatTimeLong(timedBreakMs)}
          </span>
          {elapsed >= timedBreakMs && (
            <span className="ml-2 font-semibold" style={{ color: 'var(--color-accent)' }}>
              &mdash; time&apos;s up!
            </span>
          )}
        </div>
      )}

      {/* Debt prompt */}
      {showDebtPrompt && (
        <div
          className="rounded-xl p-3 flex flex-col gap-2 border"
          style={{
            background: 'var(--color-debt-dim)',
            borderColor: 'rgba(248,113,113,0.3)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--color-debt)' }}>
            You don&apos;t have any rest time. Is this important?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowDebtPrompt(false);
                setBreakMode('open');
                startBreak(mode);
              }}
              className="flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors"
              style={{ background: 'var(--color-debt)', color: '#fff' }}
            >
              Rest Anyway
            </button>
            <button
              onClick={() => setShowDebtPrompt(false)}
              className="flex-1 py-1.5 text-sm font-semibold rounded-lg transition-colors"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              Keep Going
            </button>
          </div>
        </div>
      )}

      {/* Break picker */}
      {breakMode === 'picker' && (
        <div className="flex flex-col gap-2">
          <div
            className="text-sm text-center"
            style={{ color: 'var(--color-text-muted)' }}
          >
            How long?
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {breakOptions.map((ms) => (
              <button
                key={ms}
                onClick={() => handleStartTimedBreak(ms)}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: ms === lastBreakMs ? 'var(--color-rest)' : 'var(--color-rest-dim)',
                  color: ms === lastBreakMs ? 'var(--color-bg)' : 'var(--color-rest)',
                  border: `1px solid ${ms === lastBreakMs ? 'var(--color-rest)' : 'rgba(52,211,153,0.3)'}`,
                }}
              >
                {ms / 60_000} min
              </button>
            ))}
            <button
              onClick={() => handleStartTimedBreak(bankForPicker)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: 'var(--color-rest-dim)',
                color: 'var(--color-rest)',
                border: '1px solid rgba(52,211,153,0.3)',
              }}
            >
              All ({formatTimeLong(bankForPicker)})
            </button>
            <button
              onClick={handleStartOpenBreak}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              Open
            </button>
          </div>
          <button
            onClick={() => setBreakMode(null)}
            className="text-sm text-center transition-opacity opacity-50 hover:opacity-100"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Rest button */}
      {!showDebtPrompt && breakMode === null && timerState === 'working' && (
        <button
          onClick={handleBreakClick}
          className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: 'var(--color-rest)',
            color: 'var(--color-bg)',
            fontFamily: 'var(--font-display)',
          }}
        >
          Rest
        </button>
      )}
    </motion.div>
  );
}
