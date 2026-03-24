import { useState } from 'react';
import { useTasks } from '../store/tasks';
import { todayKey, isStale, daysSince } from '../utils/thirdTime';
import { ModeSelector } from './ModeSelector';

interface Props {
  onStart: () => void;
}

export function DailyOnboarding({ onStart }: Props) {
  const { tasks, addTask, updateTask, deleteTask } = useTasks();
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');

  const today = todayKey();
  const staleTasks = tasks.filter((t) => t.status !== 'done' && isStale(t.createdAt));
  const todayTasks = tasks.filter((t) => t.scheduledDate === today && t.status !== 'done');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTask(title.trim(), today, estimate ? Number(estimate) : undefined);
    setTitle('');
    setEstimate('');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-lg flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-md">
            <span className="text-white text-lg font-bold">&#x2153;</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            What are we working on today?
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Plan your day, then press Start.
          </p>
        </div>

        {/* Stale tasks */}
        {staleTasks.length > 0 && (
          <div className="rounded-2xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 p-4 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-orange-500 text-base">&#x26A0;</span>
              <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                {staleTasks.length} task{staleTasks.length > 1 ? 's have' : ' has'} been on your list for a while
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {staleTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-gray-700 dark:text-gray-300">
                    {t.title}
                    <span className="ml-2 text-[10px] text-orange-500 font-medium">
                      {daysSince(t.createdAt)}d old
                    </span>
                  </span>
                  <button
                    onClick={() => updateTask(t.id, { scheduledDate: today })}
                    className="px-2.5 py-1 text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900 transition-colors font-medium"
                  >
                    Prioritize
                  </button>
                  <button
                    onClick={() => deleteTask(t.id)}
                    className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors font-medium"
                  >
                    Discard
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Add task form */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col gap-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Today&apos;s tasks
          </div>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task..."
              className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 placeholder-gray-400 dark:placeholder-gray-500"
            />
            <input
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="min"
              type="number"
              min="1"
              className="w-16 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-2 py-2 text-sm text-center outline-none focus:border-indigo-400 placeholder-gray-400"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white transition-colors"
            >
              Add
            </button>
          </form>

          {/* Today's task list */}
          {todayTasks.length > 0 && (
            <ul className="flex flex-col gap-1.5 mt-1">
              {todayTasks
                .sort((a, b) => a.order - b.order)
                .map((task) => (
                  <li key={task.id} className="flex items-center gap-2 text-sm py-1.5 border-t border-gray-100 dark:border-gray-800 first:border-0">
                    <span className="flex-1 text-gray-700 dark:text-gray-300">{task.title}</span>
                    {task.estimateMin && (
                      <span className="text-[10px] text-gray-400">{task.estimateMin}m</span>
                    )}
                  </li>
                ))}
            </ul>
          )}
          {todayTasks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">No tasks yet — add some above</p>
          )}
        </div>

        {/* Effort level selector */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 text-center">
            Effort Level
          </div>
          <ModeSelector />
        </div>

        {/* CTA */}
        <button
          onClick={onStart}
          className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-bold text-base hover:bg-indigo-500 transition-colors shadow-sm"
        >
          Start →
        </button>
      </div>
    </div>
  );
}
