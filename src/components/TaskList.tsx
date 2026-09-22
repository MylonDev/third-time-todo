import { useState, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks } from '../store/tasks';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';
import { useProjects } from '../store/projects';
import { todayKey, isStale, daysSince, formatTimeLong, shiftDayKey } from '../utils/thirdTime';
import { ActionMenu } from './ActionMenu';
import { InlineInput } from './InlineInput';
import { useActiveTarget } from '../hooks/useFocusable';
import { useElapsed } from '../hooks/useNow';
import { scheduleDays, occursOn, overdueTasks, type ScheduleView } from '../utils/schedule';
import { recurrenceLabel, WEEKDAY_LABELS } from '../utils/recurrence';
import type { Project, Recurrence, RecurringTask, Task } from '../types';

function SortableTask({
  task,
  projects,
  today,
  onUpdate,
  onDelete,
  onMove,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onEditSubtask,
  onAdjustTrackedMs,
  onSetTaskProject,
}: {
  task: Task;
  projects: Project[];
  today: string;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, scheduledDate: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDeleteSubtask: (taskId: string, subtaskId: string) => void;
  onEditSubtask: (taskId: string, subtaskId: string, title: string) => void;
  onAdjustTrackedMs: (id: string, deltaMs: number) => void;
  onSetTaskProject: (id: string, projectId?: string) => void;
}) {
  const enabled = task.status !== 'done';
  const { taskId: activeTaskId } = useActiveTarget();
  const timerState = useSession((s) => s.timerState);
  const timerStart = useSession((s) => s.timerStart);
  const setActive = useSession((s) => s.setActive);

  const isFocused = enabled && activeTaskId === task.id;
  const tracking = isFocused && timerState === 'working';
  const segmentMs = useElapsed(tracking ? timerStart : null, tracking);

  /** Focusing the row that already holds the target clears it. */
  const toggleFocus = () => {
    if (!enabled) return;
    setActive(undefined, isFocused ? undefined : task.id);
  };

  const taskProject = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: task.status === 'done',
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition ? transition.replace('250ms', '120ms') : undefined,
  };

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('');
  const [showTimeEdit, setShowTimeEdit] = useState(false);
  const [timeEditMin, setTimeEditMin] = useState('');

  const liveTrackedMs = (task.trackedMs ?? 0) + segmentMs;

  const showTracked = liveTrackedMs > 0;

  const handleTimeAdjust = () => {
    const min = parseFloat(timeEditMin);
    if (!isNaN(min)) {
      onAdjustTrackedMs(task.id, Math.round(min * 60_000));
    }
    setShowTimeEdit(false);
    setTimeEditMin('');
  };

  const saveEdit = () => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      onUpdate(task.id, { title: trimmed });
    }
    setEditing(false);
  };

  const handleSubtaskAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newSubtask.trim()) {
      onAddSubtask(task.id, newSubtask.trim());
      setNewSubtask('');
    }
  };

  const saveSubtaskEdit = () => {
    if (editingSubtaskId && editSubtaskTitle.trim()) {
      onEditSubtask(task.id, editingSubtaskId, editSubtaskTitle.trim());
    }
    setEditingSubtaskId(null);
  };

  const subtasks = task.subtasks ?? [];
  const doneSubtasks = subtasks.filter((s) => s.done).length;
  const isDone = task.status === 'done';
  // Left undone on a day that has passed: kept where it was planned, as
  // history, and greyed. Today's Overdue strip is where it gets picked up.
  const missed = !isDone && task.scheduledDate < today;
  const moveAction = missed
    ? { label: 'Move to today', onSelect: () => onMove(task.id, today) }
    : task.scheduledDate === today
    ? { label: 'Move to tomorrow', onSelect: () => onMove(task.id, shiftDayKey(today, 1)) }
    : { label: 'Move to next day', onSelect: () => onMove(task.id, shiftDayKey(task.scheduledDate, 1)) };

  const cardStyle: React.CSSProperties = isDragging
    ? {
        background: 'var(--color-surface-2)',
        borderColor: 'var(--color-accent)',
        opacity: 0.85,
        boxShadow: 'var(--shadow-raised)',
      }
    : isDone || missed
    ? {
        background: 'var(--color-surface-2)',
        borderColor: 'var(--color-border)',
        borderStyle: missed ? 'dashed' : undefined,
        opacity: 0.55,
      }
    : isFocused
    ? {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-accent)',
        borderLeftWidth: '3px',
        boxShadow: `inset 0 0 0 1px var(--color-accent-dim)`,
        cursor: 'pointer',
      }
    : {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        cursor: isDone ? 'default' : 'pointer',
      };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDone) return;
    // Anything interactive on the row — including a custom control that
    // isn't a native form element, like the project-picker's `role="option"`
    // rows below — has to opt out of the row's own click-to-focus, or
    // picking one silently re-toggles the timer's target underneath it.
    if ((e.target as HTMLElement).closest('button, input, textarea, a, [role="option"], [role="menuitem"]')) return;
    toggleFocus();
  };

  return (
    <li
      ref={setNodeRef}
      style={{ ...style, ...cardStyle }}
      className="flex flex-col rounded-xl border transition-[border-color,background-color,opacity]"
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Drag handle */}
        {!isDone ? (
          <button
            {...attributes}
            {...listeners}
            className="mt-1 flex-shrink-0 touch-none cursor-grab active:cursor-grabbing opacity-20 hover:opacity-60 transition-opacity"
            style={{ color: 'var(--color-text-muted)' }}
            title="Drag to reorder"
            aria-label={`Reorder ${task.title}`}
          >
            ⠿
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Status toggle — square checkbox */}
        <button
          onClick={() => onUpdate(task.id, { status: isDone ? 'todo' : 'done' })}
          role="checkbox"
          aria-checked={isDone}
          aria-label={task.title}
          className="flex-shrink-0 flex items-center justify-center transition-all"
          style={{
            width: '20px',
            height: '20px',
            marginTop: '2px',
            borderRadius: '4px',
            border: `2px solid ${
              isDone
                ? 'var(--color-rest)'
                : isFocused
                ? 'var(--color-accent)'
                : 'var(--color-border-strong)'
            }`,
            background: isDone ? 'var(--color-rest)' : 'transparent',
            color: isDone ? 'var(--color-bg)' : 'transparent',
          }}
          title={isDone ? 'Mark as to do' : 'Mark as done'}
        >
          {isDone && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path
                d="M1 4L3.5 6.5L9 1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <InlineInput
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onCommit={saveEdit}
                onCancel={() => setEditing(false)}
                onBlur={saveEdit}
                className="w-full text-sm"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="text-[15px] font-medium leading-snug"
                  style={{
                    color: isDone ? 'var(--color-text-muted)' : 'var(--color-text)',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {task.title}
                </span>
                {isFocused && !isDone && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                    style={{
                      background: 'var(--color-accent-dim)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    Focused
                  </span>
                )}
                {taskProject && (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
                  >
                    {taskProject.color && (
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: taskProject.color }}
                        aria-hidden
                      />
                    )}
                    {taskProject.name}
                  </span>
                )}
                {!isDone && (
                  <button
                    onClick={toggleFocus}
                    aria-label={`Track time on ${task.title}`}
                    aria-pressed={isFocused}
                    className="text-xs transition-opacity opacity-50 hover:opacity-100"
                    style={{ color: isFocused ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                    title={isFocused ? 'Stop tracking this task' : 'Track time on this task'}
                  >
                    ▶
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
                {missed && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--color-debt-dim)', color: 'var(--color-debt)' }}
                  >
                    missed
                  </span>
                )}
                {isStale(task.createdAt) && !isDone && !missed && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'var(--color-accent-dim)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    <span className="num">{daysSince(task.createdAt)}d</span> old
                  </span>
                )}
                {subtasks.length > 0 && (
                  <button
                    onClick={() => setSubtasksOpen((o) => !o)}
                    className="text-xs transition-opacity opacity-60 hover:opacity-100"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {subtasksOpen ? '▾' : '▸'} <span className="num">{doneSubtasks}/{subtasks.length}</span>
                  </button>
                )}
              </div>

              {/* Tracked time row */}
              {(showTracked || showTimeEdit) && !isDone && (
                <div className="flex flex-col gap-1 mt-1">
                  {showTracked && (
                    <span
                      className="text-xs"
                      style={{ color: tracking ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                    >
                      Tracked{' '}
                      <span className="num font-semibold">{formatTimeLong(liveTrackedMs)}</span>
                    </span>
                  )}
                  {showTimeEdit && (
                    <div className="flex items-center gap-1">
                      <InlineInput
                        autoFocus
                        type="number"
                        placeholder="±min"
                        value={timeEditMin}
                        onChange={(e) => setTimeEditMin(e.target.value)}
                        onCommit={handleTimeAdjust}
                        onCancel={() => { setShowTimeEdit(false); setTimeEditMin(''); }}
                        onBlur={handleTimeAdjust}
                        className="w-20 text-xs"
                      />
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>min (+ or −)</span>
                    </div>
                  )}
                </div>
              )}

              {showProjectPicker && !isDone && (
                <div
                  role="listbox"
                  aria-label="Project"
                  className="flex flex-col gap-0.5 mt-1.5 rounded-lg border p-1"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
                >
                  <div
                    role="option"
                    tabIndex={0}
                    aria-selected={!task.projectId}
                    onClick={() => {
                      onSetTaskProject(task.id, undefined);
                      setShowProjectPicker(false);
                    }}
                    className="text-xs px-2 py-1 rounded-md cursor-pointer hover:bg-[var(--color-surface)]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    No project
                  </div>
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      role="option"
                      tabIndex={0}
                      aria-selected={task.projectId === p.id}
                      onClick={() => {
                        onSetTaskProject(task.id, p.id);
                        setShowProjectPicker(false);
                      }}
                      className="text-xs px-2 py-1 rounded-md cursor-pointer hover:bg-[var(--color-surface)]"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 3-dot menu */}
        {!isDone && !editing && (
          <ActionMenu
            label="Task actions"
            actions={[
              {
                label: 'Edit',
                onSelect: () => {
                  setEditTitle(task.title);
                  setEditing(true);
                },
              },
              { label: 'Subtasks', onSelect: () => setSubtasksOpen((o) => !o) },
              moveAction,
              {
                label: 'Adjust tracked time',
                onSelect: () => { setShowTimeEdit(true); setTimeEditMin(''); },
              },
              { label: 'Project…', onSelect: () => setShowProjectPicker(true) },
              { label: 'Delete', onSelect: () => onDelete(task.id), danger: true },
            ]}
          />
        )}
        {isDone && (
          <button
            onClick={() => onDelete(task.id)}
            className="opacity-30 hover:opacity-100 transition-opacity text-sm flex-shrink-0"
            style={{ color: 'var(--color-debt)' }}
            title="Delete"
            aria-label={`Delete ${task.title}`}
          >
            ✕
          </button>
        )}
      </div>

      {/* Subtasks panel */}
      {subtasksOpen && (
        <div
          className="px-3 pb-3 pl-10 flex flex-col gap-1.5 border-t pt-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {subtasks.map((st) => (
            <div key={st.id} className="flex items-center gap-2 group">
              <button
                onClick={() => onToggleSubtask(task.id, st.id)}
                role="checkbox"
                aria-checked={st.done}
                aria-label={st.title}
                className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] transition-colors"
                style={{
                  background: st.done ? 'var(--color-rest)' : 'transparent',
                  borderColor: st.done ? 'var(--color-rest)' : 'var(--color-border-strong)',
                  color: st.done ? 'var(--color-bg)' : 'transparent',
                }}
              >
                {st.done ? '✓' : ''}
              </button>
              {editingSubtaskId === st.id ? (
                <InlineInput
                  autoFocus
                  value={editSubtaskTitle}
                  onChange={(e) => setEditSubtaskTitle(e.target.value)}
                  onCommit={saveSubtaskEdit}
                  onCancel={() => setEditingSubtaskId(null)}
                  onBlur={saveSubtaskEdit}
                  className="flex-1 text-xs"
                />
              ) : (
                <span
                  className="text-[13px] flex-1 leading-snug"
                  style={{
                    color: st.done ? 'var(--color-text-muted)' : 'var(--color-text)',
                    textDecoration: st.done ? 'line-through' : 'none',
                  }}
                >
                  {st.title}
                </span>
              )}
              <ActionMenu
                label="Subtask actions"
                triggerClassName="w-6 h-6 opacity-0 group-hover:opacity-60 hover:!opacity-100"
                offsetClassName="top-7"
                widthClassName="min-w-[100px]"
                actions={[
                  {
                    label: 'Edit',
                    onSelect: () => { setEditingSubtaskId(st.id); setEditSubtaskTitle(st.title); },
                  },
                  {
                    label: 'Delete',
                    onSelect: () => onDeleteSubtask(task.id, st.id),
                    danger: true,
                  },
                ]}
              />
            </div>
          ))}
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={handleSubtaskAdd}
            placeholder="Add subtask… (Enter to save)"
            className="text-xs bg-transparent outline-none py-0.5 border-b border-dashed transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>
      )}
    </li>
  );
}

// ── Recurring occurrences ─────────────────────────────────────────────────────

function ProjectChip({ project }: { project: Project }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
    >
      {project.color && (
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: project.color }} aria-hidden />
      )}
      {project.name}
    </span>
  );
}

function OccurrenceRow({
  rt,
  day,
  today,
  project,
}: {
  rt: RecurringTask;
  day: string;
  today: string;
  project?: Project;
}) {
  const { toggleOccurrence, skipOccurrence, endRecurring, deleteRecurring } = useTasks();
  const done = !!rt.completions[day];
  // A past occurrence left undone is just not done — never overdue.
  const past = day < today;
  return (
    <li
      className="flex items-start gap-3 rounded-xl border p-3"
      style={{
        background: done || past ? 'var(--color-surface-2)' : 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        opacity: done || past ? 0.55 : 1,
      }}
      data-testid="occurrence"
    >
      <span className="w-4 flex-shrink-0" />
      <button
        onClick={() => toggleOccurrence(rt.id, day)}
        role="checkbox"
        aria-checked={done}
        aria-label={rt.title}
        className="flex-shrink-0 flex items-center justify-center text-[11px]"
        style={{
          width: '20px',
          height: '20px',
          marginTop: '2px',
          borderRadius: '10px',
          border: `2px solid ${done ? 'var(--color-rest)' : 'var(--color-border-strong)'}`,
          background: done ? 'var(--color-rest)' : 'transparent',
          color: done ? 'var(--color-bg)' : 'transparent',
        }}
        title={done ? 'Mark as not done' : 'Mark this day done'}
      >
        {done && '✓'}
      </button>
      <div className="flex-1 min-w-0">
        <span
          className="text-[15px] font-medium leading-snug"
          style={{
            color: done ? 'var(--color-text-muted)' : 'var(--color-text)',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {rt.title}
        </span>
        <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            ↻ {recurrenceLabel(rt.rule)}
          </span>
          {project && <ProjectChip project={project} />}
        </div>
      </div>
      <ActionMenu
        label="Repeating task actions"
        actions={[
          { label: 'Skip this day', onSelect: () => skipOccurrence(rt.id, day) },
          { label: 'Stop repeating', onSelect: () => endRecurring(rt.id) },
          { label: 'Delete', onSelect: () => deleteRecurring(rt.id), danger: true },
        ]}
      />
    </li>
  );
}

// ── The board ────────────────────────────────────────────────────────────────

type ProjectFilter = 'all' | 'none' | string;
type RepeatChoice = 'none' | 'daily' | 'weekdays' | 'weekly' | 'everyN';

function columnLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === shiftDayKey(today, 1)) return 'Tomorrow';
  if (day === shiftDayKey(today, -1)) return 'Yesterday';
  return new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' });
}

function shortDate(day: string): string {
  return new Date(day + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The Tasks tab: a week of day columns (spec phase 3). One-off tasks sit on
 * the day they were planned for and stay there — an unfinished one from a
 * past day is shown greyed as missed, and surfaces in today's Overdue strip.
 * Recurring tasks are rules; their occurrences are drawn wherever they fall.
 */
export function TaskList() {
  const {
    tasks, recurring, addTask, addRecurring, updateTask, deleteTask, moveToDate,
    reorderTasks, addSubtask, toggleSubtask, deleteSubtask, editSubtask,
    adjustManualMs, restoreTask, setTaskProject,
  } = useTasks();
  const projects = useProjects((s) => s.projects);
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const today = todayKey(dayEndHour);

  const [view, setView] = useState<ScheduleView>('rolling');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<string | null>(null); // null = today
  const [repeat, setRepeat] = useState<RepeatChoice>('none');
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [everyN, setEveryN] = useState('2');
  const [showOverdue, setShowOverdue] = useState(true);
  const [openDone, setOpenDone] = useState<Record<string, boolean>>({});

  // Delete commits immediately; the toast holds a snapshot so Undo can put it back.
  // (A deferred delete loses the task if the tab closes while the toast is up.)
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDelete = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    deleteTask(id);
    setUndoTask(task);
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setUndoTask(null);
    }, 6000);
  };

  const handleUndoDelete = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoTask) restoreTask(undoTask);
    setUndoTask(null);
  };

  useEffect(
    () => () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    },
    []
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Reordering with the keyboard: focus a drag handle, space to lift, arrows to move.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const days = useMemo(() => scheduleDays(view, today, dayEndHour), [view, today, dayEndHour]);
  const addDays = useMemo(() => scheduleDays('rolling', today, dayEndHour), [today, dayEndHour]);
  const targetDay = day && day >= today ? day : today;

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (t) => !t.routineId && (filter === 'all' || (filter === 'none' ? !t.projectId : t.projectId === filter))
      ),
    [tasks, filter]
  );
  const visibleRecurring = useMemo(
    () =>
      recurring.filter(
        (r) => filter === 'all' || (filter === 'none' ? !r.projectId : r.projectId === filter)
      ),
    [recurring, filter]
  );
  const overdue = useMemo(() => overdueTasks(visibleTasks, today), [visibleTasks, today]);
  const projectOf = (id?: string) => (id ? projects.find((p) => p.id === id) : undefined);
  const liveProjects = projects.filter((p) => !p.archivedAt);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    // A task added while filtered to a project belongs to that project.
    const projectId = filter !== 'all' && filter !== 'none' ? filter : undefined;
    if (repeat === 'none') {
      addTask(trimmed, targetDay, projectId);
    } else {
      const rule: Recurrence =
        repeat === 'daily'
          ? { kind: 'daily' }
          : repeat === 'weekly'
          ? { kind: 'weekly' }
          : repeat === 'weekdays'
          ? { kind: 'weekdays', days: weekdays }
          : { kind: 'everyN', n: Math.max(2, parseInt(everyN, 10) || 2) };
      addRecurring(trimmed, rule, new Date(targetDay + 'T12:00:00').getTime(), projectId);
    }
    setTitle('');
  };

  const dragEndFor = (column: Task[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = column.findIndex((t) => t.id === active.id);
      const newIndex = column.findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      reorderTasks(arrayMove(column, oldIndex, newIndex).map((t) => t.id));
    }
  };

  const rowProps = {
    projects,
    today,
    onUpdate: updateTask,
    onDelete: handleDelete,
    onMove: moveToDate,
    onAddSubtask: addSubtask,
    onToggleSubtask: toggleSubtask,
    onDeleteSubtask: deleteSubtask,
    onEditSubtask: editSubtask,
    onAdjustTrackedMs: adjustManualMs,
    onSetTaskProject: setTaskProject,
  };

  const fieldStyle: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    borderColor: 'var(--color-border)',
  };

  const segment = (active: boolean): React.CSSProperties =>
    active
      ? { background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-border-strong)' }
      : { color: 'var(--color-text-muted)', borderColor: 'transparent' };

  return (
    <div className="flex flex-col gap-4">
      {/* View + filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label="View">
          {([['rolling', 'Rolling'], ['week', 'This week']] as const).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className="rounded-lg border px-3 py-1 text-xs font-semibold"
              style={segment(view === v)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Project filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border px-2 py-1 text-xs outline-none"
          style={fieldStyle}
        >
          <option value="all">All projects</option>
          <option value="none">No project</option>
          {liveProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Add task form */}
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm outline-none border transition-colors"
            style={fieldStyle}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <label className="flex items-center gap-1.5">
            {repeat === 'none' ? 'On' : 'Starting'}
            <select
              aria-label="Day"
              value={targetDay}
              onChange={(e) => setDay(e.target.value)}
              className="rounded-lg border px-2 py-1 outline-none"
              style={fieldStyle}
            >
              {addDays.map((d) => (
                <option key={d} value={d}>
                  {columnLabel(d, today)}
                  {d !== today && d !== shiftDayKey(today, 1) ? ` ${shortDate(d)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Repeat
            <select
              aria-label="Repeat"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as RepeatChoice)}
              className="rounded-lg border px-2 py-1 outline-none"
              style={fieldStyle}
            >
              <option value="none">Never</option>
              <option value="daily">Every day</option>
              <option value="weekdays">On some weekdays</option>
              <option value="weekly">Every week</option>
              <option value="everyN">Every few days</option>
            </select>
          </label>
          {repeat === 'weekdays' && (
            <div className="flex gap-1" role="group" aria-label="Weekdays">
              {WEEKDAY_LABELS.map((label, i) => {
                const on = weekdays.includes(i);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    aria-label={label}
                    onClick={() =>
                      setWeekdays((w) => (on ? w.filter((d) => d !== i) : [...w, i].sort((a, b) => a - b)))
                    }
                    className="w-7 h-7 rounded-md border text-[11px] font-semibold"
                    style={segment(on)}
                  >
                    {label.slice(0, 2)}
                  </button>
                );
              })}
            </div>
          )}
          {repeat === 'everyN' && (
            <label className="flex items-center gap-1.5">
              every
              <input
                aria-label="Every how many days"
                type="number"
                min={2}
                value={everyN}
                onChange={(e) => setEveryN(e.target.value)}
                className="num w-14 rounded-lg border px-2 py-1 outline-none"
                style={fieldStyle}
              />
              days
            </label>
          )}
        </div>
      </form>

      {/* Day columns — a board on wide screens, a stack on narrow ones */}
      <div
        className="flex flex-col gap-4 lg:grid lg:grid-flow-col lg:auto-cols-[minmax(220px,1fr)] lg:gap-3 lg:overflow-x-auto lg:pb-2"
        data-testid="schedule"
      >
        {days.map((d) => {
          const dayTasks = visibleTasks.filter((t) => t.scheduledDate === d);
          const open = dayTasks.filter((t) => t.status !== 'done').sort((a, b) => a.order - b.order);
          const done = dayTasks.filter((t) => t.status === 'done').sort((a, b) => a.order - b.order);
          const occurrences = visibleRecurring
            .filter((r) => occursOn(r, d, dayEndHour))
            .sort((a, b) => a.order - b.order);
          const isToday = d === today;
          const empty = open.length === 0 && done.length === 0 && occurrences.length === 0;

          return (
            <section
              key={d}
              aria-label={`${columnLabel(d, today)}, ${shortDate(d)}`}
              data-day={d}
              className="flex flex-col gap-2 min-w-0"
            >
              <header
                className="flex items-baseline justify-between gap-2 border-b pb-1.5"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span
                  className="text-sm font-semibold"
                  style={{
                    color: isToday
                      ? 'var(--color-accent)'
                      : d < today
                      ? 'var(--color-text-muted)'
                      : 'var(--color-text)',
                  }}
                >
                  {columnLabel(d, today)}
                </span>
                <span className="num text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {shortDate(d)}
                </span>
              </header>

              {isToday && overdue.length > 0 && (
                <div
                  className="rounded-xl border p-2 flex flex-col gap-1"
                  style={{ borderColor: 'var(--color-debt-edge)', background: 'var(--color-debt-dim)' }}
                  data-testid="overdue"
                >
                  <button
                    onClick={() => setShowOverdue((o) => !o)}
                    aria-expanded={showOverdue}
                    className="flex items-center gap-1.5 text-xs font-semibold text-left"
                    style={{ color: 'var(--color-debt)' }}
                  >
                    <span>{showOverdue ? '▾' : '▸'}</span>
                    Overdue ({overdue.length})
                  </button>
                  {showOverdue && (
                    <ul className="flex flex-col gap-1">
                      {overdue.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-[13px]">
                          <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text)' }}>
                            {t.title}
                          </span>
                          <span className="num text-[11px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                            {shortDate(t.scheduledDate)}
                          </span>
                          <button
                            onClick={() => moveToDate(t.id, today)}
                            aria-label={`Move ${t.title} to today`}
                            className="text-[11px] font-semibold rounded-md border px-1.5 py-0.5 flex-shrink-0"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                          >
                            Today
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEndFor(open)}>
                <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-1.5">
                    {open.map((task) => (
                      <SortableTask key={task.id} task={task} {...rowProps} />
                    ))}
                    {occurrences.map((rt) => (
                      <OccurrenceRow key={rt.id} rt={rt} day={d} today={today} project={projectOf(rt.projectId)} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>

              {empty && (
                <p className="text-center text-xs py-3" style={{ color: 'var(--color-text-muted)' }}>
                  {isToday ? 'No tasks yet — add some above' : 'Nothing planned'}
                </p>
              )}

              {done.length > 0 && (
                <div>
                  <button
                    onClick={() => setOpenDone((o) => ({ ...o, [d]: !o[d] }))}
                    className="flex items-center gap-1.5 text-xs font-semibold transition-opacity opacity-50 hover:opacity-100"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <span>{openDone[d] ? '▾' : '▸'}</span>
                    {done.length} completed
                  </button>
                  {openDone[d] && (
                    <ul className="flex flex-col gap-1.5 mt-2">
                      {done.map((task) => (
                        <SortableTask key={task.id} task={task} {...rowProps} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Undo delete toast */}
      {undoTask && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 border text-sm"
          style={{
            background: 'var(--color-surface-2)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span className="truncate">
            Deleted{' '}
            <span style={{ color: 'var(--color-text)' }}>{undoTask.title}</span>
          </span>
          <button
            onClick={handleUndoDelete}
            className="font-semibold flex-shrink-0 transition-opacity hover:opacity-100 opacity-80"
            style={{ color: 'var(--color-accent)' }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
