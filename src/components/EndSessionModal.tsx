import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../store/session';
import { useTasks } from '../store/tasks';
import { formatTimeLong, todayKey } from '../utils/thirdTime';
import type { Mode, SessionReport, TaskDisposition } from '../types';

type Step = 'confirm' | 'disposition' | 'report';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mode: Mode;
}

const DISPOSITION_LABELS: Record<TaskDisposition, string> = {
  'move-to-tomorrow': 'Tomorrow',
  'mark-done': 'Done',
  discard: 'Discard',
};

export function EndSessionModal({ isOpen, onClose, mode }: Props) {
  const { endSession } = useSession();
  const { tasks, updateTask, deleteTask, moveToTomorrow } = useTasks();

  const [step, setStep] = useState<Step>('confirm');
  const [report, setReport] = useState<SessionReport | null>(null);
  const [dispositions, setDispositions] = useState<Record<string, TaskDisposition>>({});

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('confirm');
        setReport(null);
        setDispositions({});
      }, 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const today = todayKey();
  const unfinishedTasks = tasks.filter(
    (t) => t.scheduledDate === today && t.status !== 'done'
  );
  const completedTasks = tasks.filter(
    (t) => t.scheduledDate === today && t.status === 'done'
  ).length;
  const totalTasks = tasks.filter((t) => t.scheduledDate === today).length;

  const handleConfirm = () => {
    const raw = endSession(mode);
    const fullReport: SessionReport = {
      ...raw,
      completedTasks,
      totalTasks,
    };
    setReport(fullReport);
    if (unfinishedTasks.length === 0) {
      setStep('report');
    } else {
      setStep('disposition');
    }
  };

  const handleApplyDispositions = () => {
    unfinishedTasks.forEach((task) => {
      const d = dispositions[task.id];
      if (d === 'mark-done') updateTask(task.id, { status: 'done' });
      else if (d === 'move-to-tomorrow') moveToTomorrow(task.id);
      else if (d === 'discard') deleteTask(task.id);
    });
    setStep('report');
  };

  const allDisposed = unfinishedTasks.every((t) => dispositions[t.id] !== undefined);

  const workBreakRatio =
    report && report.totalBreakMs > 0
      ? `${(report.totalWorkMs / report.totalBreakMs).toFixed(1)}:1`
      : report
      ? 'No breaks'
      : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        className="rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-5 p-6 border"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      >
        {/* Step 1: Confirm */}
        {step === 'confirm' && (
          <>
            <div className="text-center">
              <div className="text-2xl mb-2">🏁</div>
              <h2
                className="text-lg font-bold"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
              >
                End this session?
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Your timer will be stopped and the day summarised.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                End Session
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                style={{
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Step 2: Task Disposition */}
        {step === 'disposition' && (
          <>
            <div>
              <h2
                className="text-lg font-bold"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
              >
                Unfinished tasks
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                What should happen to these?
              </p>
            </div>
            <ul className="flex flex-col gap-3 max-h-64 overflow-y-auto">
              {unfinishedTasks.map((task) => (
                <li key={task.id} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {task.title}
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['move-to-tomorrow', 'mark-done', 'discard'] as TaskDisposition[]).map((d) => {
                      const isSelected = dispositions[task.id] === d;
                      const colors: Record<TaskDisposition, { bg: string; text: string }> = {
                        'move-to-tomorrow': { bg: 'var(--color-accent-dim)', text: 'var(--color-accent)' },
                        'mark-done': { bg: 'var(--color-rest-dim)', text: 'var(--color-rest)' },
                        discard: { bg: 'var(--color-debt-dim)', text: 'var(--color-debt)' },
                      };
                      return (
                        <button
                          key={d}
                          onClick={() => setDispositions((prev) => ({ ...prev, [task.id]: d }))}
                          className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                          style={
                            isSelected
                              ? {
                                  background: colors[d].bg,
                                  color: colors[d].text,
                                  borderColor: colors[d].text,
                                }
                              : {
                                  background: 'transparent',
                                  color: 'var(--color-text-muted)',
                                  borderColor: 'var(--color-border)',
                                }
                          }
                        >
                          {DISPOSITION_LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={handleApplyDispositions}
              disabled={!allDisposed}
              className="py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              Continue to Report
            </button>
          </>
        )}

        {/* Step 3: Report */}
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
                  label: 'Unused Rest',
                  value: formatTimeLong(report.unusedRestMs),
                  highlight: report.unusedRestMs > 0,
                },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className="rounded-xl p-3 text-center"
                  style={{ background: 'var(--color-surface-2)' }}
                >
                  <div
                    className="text-sm mb-0.5"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
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
            <button
              onClick={onClose}
              className="py-2.5 rounded-xl font-semibold text-sm transition-colors"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              Done
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
