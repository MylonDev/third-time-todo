import { Modal } from './Modal';
import { formatTimeLong, formatDuration } from '../utils/thirdTime';

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

  // "Resume" credits the whole gap as active time, which at 1:3 mints real break
  // out of thin air. Past half an hour that is never what happened, so don't offer it.
  const RESUME_LIMIT_MS = 30 * 60_000;
  const canResume = timeAway <= RESUME_LIMIT_MS;

  return (
    // No onClose: the session has to be resolved one way or another, so this
    // one offers no Escape and no scrim click — only the three choices.
    <Modal label="Pick up your session" size="md" className="gap-5 p-6">
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: 'var(--color-text)' }}
          >
            Pick up your session
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
                  {formatDuration(timeAway)}
                </span>.
              </>
            )}
            {!canResume && (
              <> That&apos;s too long to count as active time, so pick up where you left
                off or start fresh.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {canResume && (
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
          )}
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
    </Modal>
  );
}
