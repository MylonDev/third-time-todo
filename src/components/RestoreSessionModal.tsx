import { motion } from 'framer-motion';
import { formatTimeLong } from '../utils/thirdTime';

interface Props {
  timerState: 'working' | 'on-break';
  elapsedAtClose: number;
  timeAway: number;
  onReset: () => void;
  onContinue: () => void;
  onResume: () => void;
}

export function RestoreSessionModal({
  timerState,
  elapsedAtClose,
  timeAway,
  onReset,
  onContinue,
  onResume,
}: Props) {
  const isWorking = timerState === 'working';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        className="rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-5 p-6 border"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      >
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: 'var(--color-text)' }}
          >
            Session Restored
          </h2>
          <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            You were{' '}
            <span style={{ color: 'var(--color-text)' }}>
              {isWorking ? 'working' : 'on a break'}
            </span>{' '}
            ({formatTimeLong(elapsedAtClose)} in) when this tab closed.
            {timeAway > 0 && (
              <> You&apos;ve been away for{' '}
                <span style={{ color: 'var(--color-text)' }}>
                  {formatTimeLong(timeAway)}
                </span>.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onResume}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
            }}
          >
            Resume — count time away as {isWorking ? 'active time' : 'rest taken'}
          </button>
          <button
            onClick={onContinue}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all border"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              borderColor: 'var(--color-border)',
            }}
          >
            Continue — pick up at {formatTimeLong(elapsedAtClose)}
          </button>
          <button
            onClick={onReset}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all border"
            style={{
              background: 'var(--color-danger-dim)',
              color: 'var(--color-danger)',
              borderColor: 'var(--color-danger)',
            }}
          >
            Reset — start a new session
          </button>
        </div>
      </motion.div>
    </div>
  );
}
