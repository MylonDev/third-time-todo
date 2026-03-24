import { useSession } from '../store/session';
import { formatTimeLong, MODE_CONFIG } from '../utils/thirdTime';
import type { Mode } from '../types';

const MODE_BADGE: Record<Mode, string> = {
  quarter: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  third: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  half: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
};

export function DailyView() {
  const { daily, resetDay } = useSession();
  const sessions = daily.sessions;

  const totalWork = sessions.reduce((acc, s) => acc + s.workMs, 0);
  const totalBreak = sessions.reduce((acc, s) => acc + s.breakMs, 0);

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5">
        <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Today&apos;s Sessions</div>
        <div className="text-sm text-gray-400 py-4 text-center">No sessions yet</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">Today&apos;s Sessions</div>
        <button
          onClick={() => { if (confirm('Reset today\'s session data?')) resetDay(); }}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors"
        >
          Reset day
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded-xl p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-indigo-500/70 dark:text-indigo-400/60 mb-0.5 font-medium">Work</div>
          <div className="font-mono font-bold text-gray-800 dark:text-gray-200 text-sm">{formatTimeLong(totalWork)}</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-emerald-500/70 dark:text-emerald-400/60 mb-0.5 font-medium">Break</div>
          <div className="font-mono font-bold text-gray-800 dark:text-gray-200 text-sm">{formatTimeLong(totalBreak)}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-gray-400/70 mb-0.5 font-medium">Sessions</div>
          <div className="font-mono font-bold text-gray-800 dark:text-gray-200 text-sm">{sessions.length}</div>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {sessions.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 text-sm py-1 border-t border-gray-100 dark:border-gray-800 first:border-0">
            <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${MODE_BADGE[s.mode]}`}>
              {MODE_CONFIG[s.mode].label}
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-mono text-xs">{formatTimeLong(s.workMs)}</span> work
            </span>
            {s.breakMs > 0 && (
              <span className="text-gray-400">
                / <span className="font-mono text-xs">{formatTimeLong(s.breakMs)}</span> break
              </span>
            )}
            <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-600">
              {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
