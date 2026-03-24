import { useEffect, useState } from 'react';
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

const DISPOSITION_COLORS: Record<TaskDisposition, string> = {
  'move-to-tomorrow': 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  'mark-done': 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  discard: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
};

export function EndSessionModal({ isOpen, onClose, mode }: Props) {
  const { endSession } = useSession();
  const { tasks, updateTask, deleteTask, moveToTomorrow } = useTasks();

  const [step, setStep] = useState<Step>('confirm');
  const [report, setReport] = useState<SessionReport | null>(null);
  const [dispositions, setDispositions] = useState<Record<string, TaskDisposition>>({});

  // Reset state when modal opens/closes
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md flex flex-col gap-5 p-6 border border-gray-200 dark:border-gray-800">
        {/* Step 1: Confirm */}
        {step === 'confirm' && (
          <>
            <div className="text-center">
              <div className="text-2xl mb-2">🏁</div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">End this session?</h2>
              <p className="text-sm text-gray-400 mt-1">Your timer will be stopped and the day summarised.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
              >
                End Session
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Unfinished tasks</h2>
              <p className="text-sm text-gray-400 mt-1">What should happen to these?</p>
            </div>
            <ul className="flex flex-col gap-3 max-h-64 overflow-y-auto">
              {unfinishedTasks.map((task) => (
                <li key={task.id} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{task.title}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['move-to-tomorrow', 'mark-done', 'discard'] as TaskDisposition[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDispositions((prev) => ({ ...prev, [task.id]: d }))}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                          dispositions[task.id] === d
                            ? DISPOSITION_COLORS[d] + ' border-transparent ring-1 ring-offset-1 dark:ring-offset-gray-900'
                            : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        {DISPOSITION_LABELS[d]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={handleApplyDispositions}
              disabled={!allDisposed}
              className="py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-gray-700 dark:hover:enabled:bg-gray-100"
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Session complete</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-0.5">Active Time</div>
                <div className="font-mono font-bold text-gray-900 dark:text-gray-100">
                  {formatTimeLong(report.totalWorkMs)}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-0.5">Rest Time</div>
                <div className="font-mono font-bold text-gray-900 dark:text-gray-100">
                  {formatTimeLong(report.totalBreakMs)}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-0.5">Active : Rest</div>
                <div className="font-mono font-bold text-gray-900 dark:text-gray-100">
                  {workBreakRatio}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-0.5">Tasks Done</div>
                <div className="font-mono font-bold text-gray-900 dark:text-gray-100">
                  {report.completedTasks} / {report.totalTasks}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
