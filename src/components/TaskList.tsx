import { useState, useRef, useEffect } from 'react';
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
        title="Actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[140px]">
          <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Edit
          </button>
          <button onClick={() => { onSubtasks(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Subtasks
          </button>
          <button onClick={() => { onMoveToTomorrow(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Move to tomorrow
          </button>
          <button onClick={() => { onDelete(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
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
        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs opacity-0 group-hover:opacity-100"
        title="Actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[100px]">
          <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Edit
          </button>
          <button onClick={() => { onDelete(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
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

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-col rounded-xl border transition-colors ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      } ${
        isDone
          ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700/50 opacity-60'
          : isDoing
          ? 'bg-white dark:bg-gray-900 border-indigo-200 dark:border-indigo-800/60 border-l-4 border-l-indigo-400 dark:border-l-indigo-500'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Drag handle */}
        {!isDone ? (
          <button
            {...attributes}
            {...listeners}
            className="mt-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            title="Drag to reorder"
          >
            ⠿
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Status toggle */}
        <button
          onClick={() => onUpdate(task.id, { status: isDone ? 'todo' : 'done' })}
          className={`mt-0.5 text-lg leading-none hover:opacity-70 transition-colors flex-shrink-0 ${
            isDone
              ? 'text-emerald-400 dark:text-emerald-500'
              : isDoing
              ? 'text-indigo-400 dark:text-indigo-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
          title={isDone ? 'Mark as to do' : 'Mark as done'}
        >
          {isDone ? '●' : '○'}
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
                className="w-full text-sm border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={editEstimate}
                  onChange={(e) => setEditEstimate(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
                  placeholder="Est. min"
                  className="w-20 text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1 outline-none focus:border-indigo-400 placeholder-gray-400"
                />
                <span className="text-xs text-gray-400">min</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-sm ${isDone ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                  {task.title}
                </span>
                {isDoing && !isDone && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-semibold">
                    Doing
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
                {task.estimateMin && (
                  <span className="text-[10px] text-gray-400">{task.estimateMin} min</span>
                )}
                {isStale(task.createdAt) && !isDone && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 font-medium">
                    {daysSince(task.createdAt)}d old
                  </span>
                )}
                {subtasks.length > 0 && (
                  <button
                    onClick={() => setSubtasksOpen((o) => !o)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {subtasksOpen ? '▾' : '▸'} {doneSubtasks}/{subtasks.length}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* 3-dot menu */}
        {!isDone && !editing && (
          <TaskMenu
            onEdit={() => { setEditTitle(task.title); setEditEstimate(task.estimateMin ? String(task.estimateMin) : ''); setEditing(true); }}
            onSubtasks={() => setSubtasksOpen((o) => !o)}
            onMoveToTomorrow={() => onMoveToTomorrow(task.id)}
            onDelete={() => onDelete(task.id)}
          />
        )}
        {isDone && (
          <button
            onClick={() => onDelete(task.id)}
            className="text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-500 transition-colors text-sm flex-shrink-0"
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>

      {/* Subtasks panel */}
      {subtasksOpen && (
        <div className="px-3 pb-3 pl-10 flex flex-col gap-1.5 border-t border-gray-100 dark:border-gray-800 pt-2">
          {subtasks.map((st) => (
            <div key={st.id} className="flex items-center gap-2 group">
              <button
                onClick={() => onToggleSubtask(task.id, st.id)}
                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] transition-colors ${
                  st.done
                    ? 'bg-emerald-400 border-emerald-400 text-white'
                    : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                }`}
              >
                {st.done ? '✓' : ''}
              </button>
              {editingSubtaskId === st.id ? (
                <input
                  autoFocus
                  value={editSubtaskTitle}
                  onChange={(e) => setEditSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveSubtaskEdit(); if (e.key === 'Escape') setEditingSubtaskId(null); }}
                  onBlur={saveSubtaskEdit}
                  className="flex-1 text-xs border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-1.5 py-0.5 outline-none"
                />
              ) : (
                <span className={`text-xs flex-1 ${st.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
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
            className="text-xs border-0 border-b border-dashed border-gray-200 dark:border-gray-700 bg-transparent text-gray-700 dark:text-gray-300 outline-none py-0.5 placeholder-gray-300 dark:placeholder-gray-600 focus:border-indigo-300 transition-colors"
          />
        </div>
      )}
    </li>
  );
}

export function TaskList() {
  const { tasks, addTask, updateTask, deleteTask, moveToTomorrow, reorderTasks, addSubtask, toggleSubtask, deleteSubtask, editSubtask } = useTasks();
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');
  const [showDone, setShowDone] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const today = todayKey();
  const todayTasks = tasks.filter((t) => t.scheduledDate === today);

  const activeTasks = todayTasks.filter((t) => t.status !== 'done').sort((a, b) => a.order - b.order);
  const doneTasks = todayTasks.filter((t) => t.status === 'done').sort((a, b) => a.order - b.order);

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

  return (
    <div className="flex flex-col gap-4">
      {/* Add task form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 placeholder-gray-400 dark:placeholder-gray-500"
        />
        <input
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          placeholder="min"
          type="number"
          min="1"
          className="w-16 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-2 py-2 text-sm text-center outline-none focus:border-indigo-400 placeholder-gray-400"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white transition-colors"
        >
          Add
        </button>
      </form>

      {/* Active tasks */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={activeTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1.5">
            {activeTasks.length === 0 && doneTasks.length === 0 && (
              <li className="text-center text-sm text-gray-400 py-6">No tasks yet — add some above</li>
            )}
            {activeTasks.map((task) => (
              <SortableTask
                key={task.id}
                task={task}
                isDoing={task.id === doingId}
                onUpdate={updateTask}
                onDelete={deleteTask}
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

      {/* Completed tasks — collapsible */}
      {doneTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors font-medium"
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
                  onDelete={deleteTask}
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
    </div>
  );
}
