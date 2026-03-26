import { useState, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks } from '../store/tasks';
import { todayKey, isStale, daysSince } from '../utils/thirdTime';
import type { Task } from '../types';

function TaskMenu({
  onEdit,
  onSubtasks,
  onMoveToTomorrow,
  onDelete,
}: {
  onEdit: () => void;
  onSubtasks: () => void;
  onMoveToTomorrow: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const menuItemStyle: React.CSSProperties = {
    color: 'var(--color-text)',
    background: 'transparent',
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-opacity opacity-40 hover:opacity-100"
        style={{ color: 'var(--color-text-muted)' }}
        title="Actions"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-20 rounded-xl shadow-xl py-1 min-w-[150px] border"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {[
            { label: 'Edit', action: onEdit },
            { label: 'Subtasks', action: onSubtasks },
            { label: 'Move to tomorrow', action: onMoveToTomorrow },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={() => { action(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm transition-colors"
              style={menuItemStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-debt)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--color-debt-dim)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function SubtaskMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-6 h-6 flex items-center justify-center rounded text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
        style={{ color: 'var(--color-text-muted)' }}
        title="Actions"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-7 z-20 rounded-xl shadow-xl py-1 min-w-[100px] border"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <button
            onClick={() => { onEdit(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            Edit
          </button>
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-debt)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-debt-dim)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function SortableTask({
  task,
  isDoing,
  onUpdate,
  onDelete,
  onMoveToTomorrow,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onEditSubtask,
}: {
  task: Task;
  isDoing: boolean;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onMoveToTomorrow: (id: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onDeleteSubtask: (taskId: string, subtaskId: string) => void;
  onEditSubtask: (taskId: string, subtaskId: string, title: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: task.status === 'done',
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editEstimate, setEditEstimate] = useState(task.estimateMin ? String(task.estimateMin) : '');
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('');

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
    : isDoing
    ? {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-accent)',
        borderLeftWidth: '3px',
        boxShadow: `inset 0 0 0 1px rgba(167,139,250,0.08)`,
      }
    : {
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      };

  return (
    <li
      ref={setNodeRef}
      style={{ ...style, ...cardStyle }}
      className="flex flex-col rounded-xl border transition-all"
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
          >
            ⠿
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Status toggle — square checkbox */}
        <button
          onClick={() => onUpdate(task.id, { status: isDone ? 'todo' : 'done' })}
          className="flex-shrink-0 flex items-center justify-center transition-all"
          style={{
            width: '20px',
            height: '20px',
            marginTop: '2px',
            borderRadius: '4px',
            border: `2px solid ${
              isDone
                ? 'var(--color-rest)'
                : isDoing
                ? 'var(--color-accent)'
                : 'rgba(255,255,255,0.2)'
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
                  className="text-sm"
                  style={{
                    color: isDone ? 'var(--color-text-muted)' : 'var(--color-text)',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {task.title}
                </span>
                {isDoing && !isDone && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                    style={{
                      background: 'var(--color-accent-dim)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    Doing
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
                {task.estimateMin && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {task.estimateMin} min
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
                    {daysSince(task.createdAt)}d old
                  </span>
                )}
                {subtasks.length > 0 && (
                  <button
                    onClick={() => setSubtasksOpen((o) => !o)}
                    className="text-xs transition-opacity opacity-60 hover:opacity-100"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {subtasksOpen ? '▾' : '▸'} {doneSubtasks}/{subtasks.length}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* 3-dot menu / delete */}
        {!isDone && !editing && (
          <TaskMenu
            onEdit={() => {
              setEditTitle(task.title);
              setEditEstimate(task.estimateMin ? String(task.estimateMin) : '');
              setEditing(true);
            }}
            onSubtasks={() => setSubtasksOpen((o) => !o)}
            onMoveToTomorrow={() => onMoveToTomorrow(task.id)}
            onDelete={() => onDelete(task.id)}
          />
        )}
        {isDone && (
          <button
            onClick={() => onDelete(task.id)}
            className="opacity-30 hover:opacity-100 transition-opacity text-sm flex-shrink-0"
            style={{ color: 'var(--color-debt)' }}
            title="Delete"
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
                className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] transition-colors"
                style={{
                  background: st.done ? 'var(--color-rest)' : 'transparent',
                  borderColor: st.done ? 'var(--color-rest)' : 'var(--color-border)',
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
                  className="text-xs flex-1"
                  style={{
                    color: st.done ? 'var(--color-text-muted)' : 'var(--color-text)',
                    textDecoration: st.done ? 'line-through' : 'none',
                  }}
                >
                  {st.title}
                </span>
              )}
              <SubtaskMenu
                onEdit={() => { setEditingSubtaskId(st.id); setEditSubtaskTitle(st.title); }}
                onDelete={() => onDeleteSubtask(task.id, st.id)}
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
  } = useTasks();
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');
  const [showDone, setShowDone] = useState(false);

  // Undo-on-delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDelete = (id: string) => {
    // Flush any existing pending delete immediately
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      if (pendingDeleteId) deleteTask(pendingDeleteId);
    }
    const task = tasks.find((t) => t.id === id) ?? null;
    setPendingDeleteId(id);
    setPendingDeleteTask(task);
    deleteTimerRef.current = setTimeout(() => {
      deleteTask(id);
      setPendingDeleteId(null);
      setPendingDeleteTask(null);
    }, 3500);
  };

  const handleUndoDelete = () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    setPendingDeleteId(null);
    setPendingDeleteTask(null);
  };

  // Flush pending delete on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
        if (pendingDeleteId) deleteTask(pendingDeleteId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeleteId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const today = todayKey();
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.scheduledDate === today),
    [tasks, today]
  );

  const activeTasks = useMemo(
    () =>
      todayTasks
        .filter((t) => t.status !== 'done' && t.id !== pendingDeleteId)
        .sort((a, b) => a.order - b.order),
    [todayTasks, pendingDeleteId]
  );
  const doneTasks = useMemo(
    () =>
      todayTasks
        .filter((t) => t.status === 'done' && t.id !== pendingDeleteId)
        .sort((a, b) => a.order - b.order),
    [todayTasks, pendingDeleteId]
  );

  const doingId = activeTasks[0]?.id ?? null;

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
      reorderTasks(String(active.id), String(over.id));
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
            background: 'var(--color-accent)',
            color: '#fff',
            fontFamily: 'var(--font-display)',
          }}
        >
          Add
        </button>
      </form>

      {/* Active tasks */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={activeTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1.5">
            {activeTasks.length === 0 && doneTasks.length === 0 && (
              <li
                className="text-center text-sm py-8"
                style={{ color: 'var(--color-text-muted)' }}
              >
                No tasks yet — add some above
              </li>
            )}
            {activeTasks.map((task) => (
              <SortableTask
                key={task.id}
                task={task}
                isDoing={task.id === doingId}
                onUpdate={updateTask}
                onDelete={handleDelete}
                onMoveToTomorrow={moveToTomorrow}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
                onEditSubtask={editSubtask}
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
                  isDoing={false}
                  onUpdate={updateTask}
                  onDelete={handleDelete}
                  onMoveToTomorrow={moveToTomorrow}
                  onAddSubtask={addSubtask}
                  onToggleSubtask={toggleSubtask}
                  onDeleteSubtask={deleteSubtask}
                  onEditSubtask={editSubtask}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Undo delete toast */}
      {pendingDeleteTask && (
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
            <span style={{ color: 'var(--color-text)' }}>{pendingDeleteTask.title}</span>
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
