import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useSession } from '../store/session';
import { useTasks } from '../store/tasks';
import { formatTimeLong, todayKey } from '../utils/thirdTime';
import type { Mode, SessionReport } from '../types';

type Step = 'confirm' | 'report';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mode: Mode;
  /** Rest earned this session and not spent, sampled when the modal opened. */
  bankToClear: number;
}

export function EndSessionModal({ isOpen, onClose, mode, bankToClear }: Props) {
  const { endSession } = useSession();
  const { tasks } = useTasks();

  const [step, setStep] = useState<Step>('confirm');
  const [report, setReport] = useState<SessionReport | null>(null);

  const restLeft = Math.max(0, bankToClear);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('confirm');
        setReport(null);
      }, 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const today = todayKey();
  const todays = tasks.filter((t) => t.scheduledDate === today);
  const completedTasks = todays.filter((t) => t.status === 'done').length;

  const handleConfirm = () => {
    const raw = endSession(mode);
    setReport({ ...raw, completedTasks, totalTasks: todays.length });
    setStep('report');
  };

  const workBreakRatio =
    report && report.totalBreakMs > 0
      ? `${(report.totalWorkMs / report.totalBreakMs).toFixed(1)}:1`
      : report
      ? 'No rest taken'
      : '';

  const sameAsSession =
    report && report.dayWorkMs === report.totalWorkMs && report.dayBreakMs === report.totalBreakMs;

  return (
    <Modal
      onClose={onClose}
      label={step === 'report' ? "The session's summary" : 'End the session'}
      size="md"
      className="gap-5 p-6"
    >
      {step === 'confirm' && (
        <>
          <div className="text-center">
            <div className="text-2xl mb-2">☕</div>
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
            >
              End the session?
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Your timer stops and the session is summarised. Today stays open —
              start another whenever you like.
            </p>
            {restLeft > 0 && (
              // Rest left on the table means the pace was sustainable. Stated
              // plainly, in muted text: it is not a loss to be warned about.
              <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
                You finish with{' '}
                <span className="num" style={{ color: 'var(--color-rest)' }}>
                  {formatTimeLong(restLeft)}
                </span>{' '}
                of rest unspent. The next session starts fresh.
              </p>
            )}
          </div>
          <button
            onClick={handleConfirm}
            className="py-2.5 rounded-xl font-semibold text-sm transition-colors"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            End the Session
          </button>
          <button
            onClick={onClose}
            className="py-2.5 rounded-xl font-semibold text-sm transition-colors"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            Cancel
          </button>
        </>
      )}

      {step === 'report' && report && (
        <>
          <div className="text-center">
            <div className="text-2xl mb-2">✅</div>
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
            >
              Session complete
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Active Time', value: formatTimeLong(report.totalWorkMs) },
              { label: 'Rest Time', value: formatTimeLong(report.totalBreakMs) },
              { label: 'Active : Rest', value: workBreakRatio },
              { label: 'Tasks Done', value: `${report.completedTasks} / ${report.totalTasks}` },
              {
                label: 'Rest Unspent',
                value: formatTimeLong(report.unusedRestMs),
                highlight: report.unusedRestMs > 0,
              },
            ].map(({ label, value, highlight }) => (
              <div
                key={label}
                className="rounded-xl p-3 text-center"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <div className="text-sm mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {label}
                </div>
                <div
                  className="font-timer font-bold text-base"
                  style={{ color: highlight ? 'var(--color-rest)' : 'var(--color-text)' }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
          {/* Only worth saying once there has been more than one session today. */}
          {!sameAsSession && (
            <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
              Today so far:{' '}
              <span className="num">{formatTimeLong(report.dayWorkMs)}</span> active,{' '}
              <span className="num">{formatTimeLong(report.dayBreakMs)}</span> rest.
            </p>
          )}
          <button
            onClick={onClose}
            className="py-2.5 rounded-xl font-semibold text-sm transition-colors"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          >
            Done
          </button>
        </>
      )}
    </Modal>
  );
}
