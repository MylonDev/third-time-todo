import { useState } from 'react';
import { Modal } from './Modal';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { useProjects } from '../store/projects';
import { useTasks } from '../store/tasks';
import { formatDuration } from '../utils/thirdTime';
import { toClockInput, fromClockInput } from '../utils/clockInput';
import type { TimeEntry } from '../types';

const label = 'text-xs font-semibold uppercase tracking-wide';
const labelStyle = { color: 'var(--color-text-muted)' } as const;
const fieldStyle = {
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  borderColor: 'var(--color-border)',
} as const;

export type EntryDraft = Pick<TimeEntry, 'kind' | 'startedAt' | 'endedAt'> & Partial<TimeEntry>;

interface Props {
  date: string;
  /** An existing entry to edit, or a draft (no `id`) to create. */
  entry: EntryDraft;
  onClose: () => void;
}

/**
 * Tap a block to correct it; drag empty rail to add one you forgot to start.
 * Every rule lives in the store — this only turns what was typed into an edit
 * and shows the store's reason when it says no.
 */
export function EntryEditor({ date, entry, onClose }: Props) {
  const isNew = !entry.id;
  const dayEndHour = useSettings((s) => s.dayEndHour);
  // A block added by hand is rated at the mode its own day was worked at.
  const dayModeFallback = useSettings((s) => s.mode);
  const defaultMode = useSession((s) =>
    s.daily.date === date ? s.daily.mode : s.history.find((h) => h.date === date)?.mode
  ) ?? dayModeFallback;
  const projects = useProjects((s) => s.projects);
  const tasks = useTasks((s) => s.tasks);
  const { addEntry, updateEntry, removeEntry, splitEntry } = useSession();

  const initialStart = toClockInput(entry.startedAt);
  const initialEnd = toClockInput(entry.endedAt);
  const [kind, setKind] = useState(entry.kind);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [projectId, setProjectId] = useState(entry.projectId ?? '');
  const [taskId, setTaskId] = useState(entry.taskId ?? '');
  const [splitAt, setSplitAt] = useState(
    toClockInput(entry.startedAt + (entry.endedAt - entry.startedAt) / 2)
  );
  const [refusal, setRefusal] = useState<string | null>(null);

  // Minute inputs can't show seconds, so an unchanged field keeps the exact
  // instant rather than rounding the block to the minute behind your back.
  const startedAt = start === initialStart ? entry.startedAt : fromClockInput(date, start, dayEndHour, false);
  const endedAt = end === initialEnd ? entry.endedAt : fromClockInput(date, end, dayEndHour, true);

  const liveProjects = projects.filter((p) => !p.archivedAt || p.id === projectId);
  const liveTasks = tasks.filter((t) => !t.routineId && (t.status !== 'done' || t.id === taskId));

  const pickTask = (id: string) => {
    setTaskId(id);
    // A task's time is always filed under the task's own project — the same
    // rule the running timer follows.
    const owner = tasks.find((t) => t.id === id)?.projectId;
    if (id) setProjectId(owner ?? '');
  };

  const targets = kind === 'work'
    ? { projectId: projectId || undefined, taskId: taskId || undefined }
    : { projectId: undefined, taskId: undefined };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const result = isNew
      ? addEntry({
          id: crypto.randomUUID(),
          kind,
          startedAt,
          endedAt,
          mode: entry.mode ?? defaultMode,
          ...targets,
        })
      : updateEntry(entry.id!, { startedAt, endedAt, ...targets });
    if (result) setRefusal(result);
    else onClose();
  };

  const split = () => {
    const result = splitEntry(entry.id!, fromClockInput(date, splitAt, dayEndHour, false));
    if (result) setRefusal(result);
    else onClose();
  };

  const remove = () => {
    removeEntry(entry.id!);
    onClose();
  };

  const title = isNew ? 'Add a block' : kind === 'work' ? 'Edit active block' : 'Edit rest block';

  return (
    <Modal onClose={onClose} label={title} size="sm">
      <form onSubmit={save} className="flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            {title}
          </h2>
          {endedAt > startedAt && (
            <span className="num text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {formatDuration(endedAt - startedAt)}
            </span>
          )}
        </div>

        {isNew && (
          <div className="flex gap-2" role="radiogroup" aria-label="Kind">
            {(['work', 'break'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className="flex-1 rounded-xl border px-3 py-1.5 text-sm font-semibold"
                style={
                  kind === k
                    ? {
                        background: k === 'work' ? 'var(--color-accent-dim)' : 'var(--color-surface-2)',
                        color: k === 'work' ? 'var(--color-accent)' : 'var(--color-rest)',
                        borderColor: k === 'work' ? 'var(--color-accent)' : 'var(--color-rest)',
                      }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                }
              >
                {k === 'work' ? 'Active' : 'Rest'}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={label} style={labelStyle}>Start</span>
            <input
              type="time"
              value={start}
              onChange={(e) => { setStart(e.target.value); setRefusal(null); }}
              className="num rounded-xl border px-3 py-2 text-sm outline-none"
              style={fieldStyle}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label} style={labelStyle}>End</span>
            <input
              type="time"
              value={end}
              onChange={(e) => { setEnd(e.target.value); setRefusal(null); }}
              className="num rounded-xl border px-3 py-2 text-sm outline-none"
              style={fieldStyle}
              required
            />
          </label>
        </div>

        {kind === 'work' && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={label} style={labelStyle}>Project</span>
              <select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setTaskId(''); }}
                className="rounded-xl border px-2 py-2 text-sm outline-none"
                style={fieldStyle}
              >
                <option value="">No project</option>
                {liveProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label} style={labelStyle}>Task</span>
              <select
                value={taskId}
                onChange={(e) => pickTask(e.target.value)}
                className="rounded-xl border px-2 py-2 text-sm outline-none"
                style={fieldStyle}
              >
                <option value="">No task</option>
                {liveTasks
                  .filter((t) => !projectId || t.projectId === projectId || t.id === taskId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
              </select>
            </label>
          </>
        )}

        {refusal && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-debt)' }}>
            {refusal}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
            }}
          >
            {isNew ? 'Add' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={remove}
              className="ml-auto rounded-xl border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--color-debt-edge)', color: 'var(--color-debt)' }}
            >
              Delete
            </button>
          )}
        </div>

        {!isNew && (
          <div
            className="flex items-end gap-2 border-t pt-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <label className="flex flex-col gap-1.5 flex-1">
              <span className={label} style={labelStyle}>Split at</span>
              <input
                type="time"
                value={splitAt}
                onChange={(e) => { setSplitAt(e.target.value); setRefusal(null); }}
                className="num rounded-xl border px-3 py-2 text-sm outline-none"
                style={fieldStyle}
              />
            </label>
            <button
              type="button"
              onClick={split}
              className="rounded-xl border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              Split
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
