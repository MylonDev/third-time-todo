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
import { todayKey, isStale, daysSince, formatTimeLong } from '../utils/thirdTime';
import { ActionMenu } from './ActionMenu';
import { useFocusable } from '../hooks/useFocusable';
import type { Task } from '../types';

function SortableTask({
  task,
  onUpdate,
  onDelete,
  onMoveToTomorrow,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onEditSubtask,
  onAdjustTrackedMs,
}: {
  task: Task;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onMoveToTomorrow: (id: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDeleteSubtask: (taskId: string, subtaskId: string) => void;
  onEditSubtask: (taskId: string, subtaskId: string, title: string) => void;
  onAdjustTrackedMs: (id: string, deltaMs: number) => void;
}) {
  const { isFocused, tracking, segmentMs, toggleFocus } = useFocusable(
    { kind: 'task', id: task.id },
    task.status !== 'done'
  );
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
  const [editEstimate, setEditEstimate] = useState(task.estimateMin ? String(task.estimateMin) : '');
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
      onUpdate(task.id, {
        title: trimmed,
        estimateMin: editEstimate ? Number(editEstimate) : undefined,
      });
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

  const cardStyle: React.CSSProperties = isDragging
    ? {
        background: 'var(--color-surface-2)',
        borderColor: 'var(--color-accent)',
        opacity: 0.85,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      }
    : isDone
    ? {
        background: 'var(--color-surface-2)',
        borderColor: 'var(--color-border)',
        opacity: 0.55,
      }
    : isFocused
    ? {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-accent)',
        borderLeftWidth: '3px',
        boxShadow: `inset 0 0 0 1px rgba(167,139,250,0.08)`,
        cursor: 'pointer',
      }
    : {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        cursor: isDone ? 'default' : 'pointer',
      };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isDone) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
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
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={saveEdit}
                className="w-full text-sm rounded-lg px-2 py-1 outline-none border transition-colors"
                style={{
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  borderColor: 'var(--color-accent)',
                }}
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={editEstimate}
                  onChange={(e) => setEditEstimate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  placeholder="Est. min"
                  className="w-20 text-xs rounded-lg px-2 py-1 outline-none border transition-colors"
                  style={{
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-border)',
                  }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>min</span>
              </div>
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
              </div>
              <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
                {task.estimateMin && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="num">{task.estimateMin}</span> min est.
                  </span>
                )}
                {isStale(task.createdAt) && !isDone && (
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
                      <input
                        autoFocus
                        type="number"
                        placeholder="±min"
                        value={timeEditMin}
                        onChange={(e) => setTimeEditMin(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleTimeAdjust();
                          if (e.key === 'Escape') { setShowTimeEdit(false); setTimeEditMin(''); }
                        }}
                        onBlur={handleTimeAdjust}
                        className="w-20 text-xs rounded px-1.5 py-1 outline-none border"
                        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-accent)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>min (+ or −)</span>
                    </div>
                  )}
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
                  setEditEstimate(task.estimateMin ? String(task.estimateMin) : '');
                  setEditing(true);
                },
              },
              { label: 'Subtasks', onSelect: () => setSubtasksOpen((o) => !o) },
              { label: 'Move to tomorrow', onSelect: () => onMoveToTomorrow(task.id) },
              {
                label: 'Adjust tracked time',
                onSelect: () => { setShowTimeEdit(true); setTimeEditMin(''); },
              },
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
                <input
                  autoFocus
                  value={editSubtaskTitle}
                  onChange={(e) => setEditSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveSubtaskEdit();
                    if (e.key === 'Escape') setEditingSubtaskId(null);
                  }}
                  onBlur={saveSubtaskEdit}
                  className="flex-1 text-xs rounded px-1.5 py-0.5 outline-none border"
                  style={{
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-accent)',
                  }}
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

export function TaskList() {
  const {
    tasks, addTask, updateTask, deleteTask, moveToTomorrow,
    reorderTasks, addSubtask, toggleSubtask, deleteSubtask, editSubtask,
    adjustTrackedMs, restoreTask,
  } = useTasks();
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');
  const [showDone, setShowDone] = useState(false);

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

  const today = todayKey();
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.scheduledDate === today),
    [tasks, today]
  );

  const activeTasks = useMemo(
    () => todayTasks.filter((t) => t.status !== 'done').sort((a, b) => a.order - b.order),
    [todayTasks]
  );

  // Routine steps have their own panel above the list, so they are not repeated here.
  const looseTasks = useMemo(() => activeTasks.filter((t) => !t.routineId), [activeTasks]);
  const doneTasks = useMemo(
    () =>
      todayTasks
        .filter((t) => t.status === 'done' && !t.routineId)
        .sort((a, b) => a.order - b.order),
    [todayTasks]
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTask(title.trim(), today, estimate ? Number(estimate) : undefined);
    setTitle('');
    setEstimate('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = looseTasks.findIndex((t) => t.id === active.id);
      const newIndex = looseTasks.findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      reorderTasks(arrayMove(looseTasks, oldIndex, newIndex).map((t) => t.id));
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    borderColor: 'var(--color-border)',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Add task form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none border transition-colors"
          style={inputStyle}
        />
        <input
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          placeholder="min"
          type="number"
          min="1"
          className="w-16 rounded-xl px-2 py-2 text-sm text-center outline-none border transition-colors"
          style={inputStyle}
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
      </form>

      {/* Loose tasks */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={looseTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1.5">
            {looseTasks.length === 0 && doneTasks.length === 0 && (
              <li
                className="text-center text-sm py-8"
                style={{ color: 'var(--color-text-muted)' }}
              >
                No tasks yet — add some above
              </li>
            )}
            {looseTasks.map((task) => (
              <SortableTask
                key={task.id}
                task={task}
                onUpdate={updateTask}
                onDelete={handleDelete}
                onMoveToTomorrow={moveToTomorrow}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
                onEditSubtask={editSubtask}
                onAdjustTrackedMs={adjustTrackedMs}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* Completed tasks */}
      {doneTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-semibold transition-opacity opacity-50 hover:opacity-100"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span>{showDone ? '▾' : '▸'}</span>
            {doneTasks.length} completed
          </button>
          {showDone && (
            <ul className="flex flex-col gap-1.5 mt-2">
              {doneTasks.map((task) => (
                <SortableTask
                  key={task.id}
                  task={task}
                  onUpdate={updateTask}
                  onDelete={handleDelete}
                  onMoveToTomorrow={moveToTomorrow}
                  onAddSubtask={addSubtask}
                  onToggleSubtask={toggleSubtask}
                  onDeleteSubtask={deleteSubtask}
                  onEditSubtask={editSubtask}
                  onAdjustTrackedMs={adjustTrackedMs}
                />
              ))}
            </ul>
          )}
        </div>
      )}

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
