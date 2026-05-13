import { useState, useEffect, useRef } from 'react';
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
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useChecklists } from '../store/checklists';
import { todayKey } from '../utils/thirdTime';
import type { Checklist, ChecklistItem, GoalPeriod } from '../types';

const PAGE_SIZE = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodLabel(period: GoalPeriod, periodDays?: number): string {
  if (period === 'daily') return 'Daily';
  if (period === 'weekly') return 'Weekly';
  return `Every ${periodDays ?? 1}d`;
}

const segBtn = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
  color: active ? '#fff' : 'var(--color-text-muted)',
  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
});

// ── ChecklistMenu ─────────────────────────────────────────────────────────────

function ChecklistMenu({
  onModify,
  onSnooze,
  onDelete,
}: {
  onModify: () => void;
  onSnooze: () => void;
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
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all opacity-60 hover:opacity-100 hover:bg-[var(--color-surface-2)]"
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
          <button
            onClick={(e) => { e.stopPropagation(); onModify(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            Modify
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSnooze(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            Snooze for today
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
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

// ── SortableItem (item row in modify mode) ────────────────────────────────────

function SortableChecklistItem({
  item,
  modifyMode,
  checklistId,
}: {
  item: ChecklistItem;
  modifyMode: boolean;
  checklistId: string;
}) {
  const { toggleItem, updateItem, deleteItem } = useChecklists();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !modifyMode,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition ? transition.replace('250ms', '120ms') : undefined,
  };

  const [editTitle, setEditTitle] = useState(item.title);
  const [editing, setEditing] = useState(false);

  const saveEdit = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== item.title) updateItem(checklistId, item.id, { title: trimmed });
    else setEditTitle(item.title);
    setEditing(false);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1 group"
    >
      {modifyMode && (
        <button
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing opacity-30 hover:opacity-70 flex-shrink-0 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
          tabIndex={-1}
        >
          ⠿
        </button>
      )}
      {!modifyMode && (
        <button
          onClick={() => toggleItem(checklistId, item.id)}
          className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-all"
          style={{
            borderColor: item.done ? 'var(--color-rest)' : 'var(--color-border)',
            background: item.done ? 'var(--color-rest)' : 'transparent',
          }}
        >
          {item.done && (
            <svg className="w-2.5 h-2.5" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      )}
      <div className="flex-1 min-w-0">
        {modifyMode && editing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') { setEditTitle(item.title); setEditing(false); }
            }}
            onBlur={saveEdit}
            className="w-full text-sm rounded px-1.5 py-0.5 outline-none border"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-accent)' }}
          />
        ) : (
          <span
            className="text-sm break-words"
            style={{
              color: item.done && !modifyMode ? 'var(--color-text-muted)' : 'var(--color-text)',
              textDecoration: item.done && !modifyMode ? 'line-through' : 'none',
              cursor: modifyMode ? 'text' : 'default',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
            onClick={() => { if (modifyMode) setEditing(true); }}
          >
            {item.title}
          </span>
        )}
      </div>
      {modifyMode && (
        <button
          onClick={() => deleteItem(checklistId, item.id)}
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity text-xs"
          style={{ color: 'var(--color-debt)' }}
        >
          ×
        </button>
      )}
    </li>
  );
}

// ── ChecklistCard ─────────────────────────────────────────────────────────────

function ChecklistCard({
  checklist,
  dragHandle,
  dragRef,
  dragStyle,
}: {
  checklist: Checklist;
  dragHandle: React.HTMLAttributes<HTMLElement>;
  dragRef: (node: HTMLElement | null) => void;
  dragStyle: React.CSSProperties;
}) {
  const { deleteChecklist, snoozeForToday, addItem, reorderItems, updateChecklist } = useChecklists();
  const [modifyMode, setModifyMode] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editTitle, setEditTitle] = useState(checklist.title);
  const [editPeriod, setEditPeriod] = useState<GoalPeriod>(checklist.period);
  const [editPeriodDays, setEditPeriodDays] = useState(String(checklist.periodDays ?? 7));

  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderItems(checklist.id, String(active.id), String(over.id));
    }
  };

  const handleAddItem = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newItemTitle.trim()) {
      addItem(checklist.id, newItemTitle.trim());
      setNewItemTitle('');
    }
  };

  const saveModify = () => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      updateChecklist(checklist.id, {
        title: trimmed,
        period: editPeriod,
        periodDays: editPeriod === 'custom' ? Math.max(1, Number(editPeriodDays) || 7) : undefined,
      });
    }
    setModifyMode(false);
  };

  const allDone = checklist.items.length > 0 && checklist.items.every((it) => it.done);
  const doneCount = checklist.items.filter((it) => it.done).length;

  const cardStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    ...(allDone
      ? { background: 'var(--color-surface)', borderColor: 'var(--color-rest)', opacity: 0.85 }
      : { background: 'var(--color-surface)', borderColor: 'var(--color-border)' }),
  };

  return (
    <li
      ref={dragRef}
      style={{ ...dragStyle, ...cardStyle }}
      className="rounded-xl border transition-[border-color,background-color,opacity] flex flex-col"
    >
      <div className="flex items-start gap-2 p-3 pb-2">
        {/* Drag handle (only when not in modify mode so it doesn't conflict) */}
        {!modifyMode && (
          <button
            {...dragHandle}
            className="touch-none cursor-grab active:cursor-grabbing opacity-20 hover:opacity-50 mt-0.5 flex-shrink-0 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
            tabIndex={-1}
          >
            ⠿
          </button>
        )}

        <div className="flex-1 min-w-0">
          {modifyMode ? (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveModify(); if (e.key === 'Escape') setModifyMode(false); }}
                className="w-full text-sm rounded-lg px-2 py-1 outline-none border font-semibold"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-accent)' }}
              />
              <div className="flex gap-1.5 flex-wrap">
                {(['daily', 'weekly', 'custom'] as GoalPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setEditPeriod(p)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold"
                    style={segBtn(editPeriod === p)}
                  >
                    {p === 'custom' ? 'Custom' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
                {editPeriod === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="2"
                      value={editPeriodDays}
                      onChange={(e) => setEditPeriodDays(e.target.value)}
                      className="w-14 rounded-lg px-2 py-1 text-xs outline-none border"
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>days</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {checklist.title}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              >
                {periodLabel(checklist.period, checklist.periodDays)}
              </span>
              {checklist.items.length > 0 && (
                <span className="text-xs" style={{ color: allDone ? 'var(--color-rest)' : 'var(--color-text-muted)' }}>
                  {doneCount}/{checklist.items.length}
                </span>
              )}
            </div>
          )}
        </div>

        <ChecklistMenu
          onModify={() => {
            setEditTitle(checklist.title);
            setEditPeriod(checklist.period);
            setEditPeriodDays(String(checklist.periodDays ?? 7));
            setModifyMode((m) => !m);
          }}
          onSnooze={() => snoozeForToday(checklist.id)}
          onDelete={() => deleteChecklist(checklist.id)}
        />
      </div>

      {/* Items list */}
      <div className="px-3 pb-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
          <SortableContext items={checklist.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col">
              {checklist.items.map((item) => (
                <SortableChecklistItem
                  key={item.id}
                  item={item}
                  modifyMode={modifyMode}
                  checklistId={checklist.id}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {/* Add item input */}
        <input
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={handleAddItem}
          placeholder="+ Add item…"
          className="w-full mt-1.5 text-sm bg-transparent outline-none border-b border-dashed py-0.5"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        />
      </div>

      {/* Modify mode: save button */}
      {modifyMode && (
        <div className="px-3 pb-3 flex justify-end">
          <button
            onClick={saveModify}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--color-accent)', color: '#fff', fontFamily: 'var(--font-display)' }}
          >
            Done
          </button>
        </div>
      )}
    </li>
  );
}

// ── SortableChecklistCard (wraps ChecklistCard with dnd for the list) ─────────

function SortableChecklistCard({ checklist }: { checklist: Checklist }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: checklist.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition ? transition.replace('250ms', '120ms') : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <ChecklistCard
      checklist={checklist}
      dragRef={setNodeRef}
      dragStyle={style}
      dragHandle={{ ...attributes, ...listeners }}
    />
  );
}

// ── AddChecklistForm ──────────────────────────────────────────────────────────

function AddChecklistForm({ onDone }: { onDone: () => void }) {
  const { addChecklist } = useChecklists();
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('daily');
  const [periodDays, setPeriodDays] = useState('7');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addChecklist({
      title: title.trim(),
      period,
      periodDays: period === 'custom' ? Math.max(1, Number(periodDays) || 7) : undefined,
    });
    onDone();
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    borderColor: 'var(--color-border)',
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 p-3 rounded-xl border"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Checklist name…"
        className="rounded-lg px-3 py-2 text-sm outline-none border"
        style={inputStyle}
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Repeats</span>
        <div className="flex gap-1.5 flex-wrap">
          {(['daily', 'weekly', 'custom'] as GoalPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={segBtn(period === p)}
            >
              {p === 'custom' ? 'Custom' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="2"
                value={periodDays}
                onChange={(e) => setPeriodDays(e.target.value)}
                className="w-14 rounded-lg px-2 py-1 text-xs outline-none border"
                style={inputStyle}
              />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>days</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--color-accent)', color: '#fff', fontFamily: 'var(--font-display)' }}
        >
          Add Checklist
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-xl text-sm opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── ChecklistList (exported) ──────────────────────────────────────────────────

const isComplete = (c: Checklist) => c.items.length > 0 && c.items.every((it) => it.done);

export function ChecklistList() {
  const { checklists, reorderChecklists } = useChecklists();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);

  const today = todayKey();
  const sorted = [...checklists]
    .filter((c) => !c.snoozedUntil || c.snoozedUntil <= today)
    .sort((a, b) => a.order - b.order);

  const completedCount = sorted.filter(isComplete).length;
  const visible = showCompleted ? sorted : sorted.filter((c) => !isComplete(c));

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageSlice = visible.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  // Clamp page when list shrinks (snooze/delete/complete)
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderChecklists(String(active.id), String(over.id));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!showForm && (
        <div>
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              fontFamily: 'var(--font-display)',
            }}
          >
            + Add Checklist
          </button>
        </div>
      )}

      {showForm && <AddChecklistForm onDone={() => setShowForm(false)} />}

      {visible.length === 0 && !showForm && completedCount === 0 && (
        <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
          No checklists yet — click above to add a routine
        </p>
      )}

      {visible.length === 0 && !showForm && completedCount > 0 && !showCompleted && (
        <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
          All routines complete for this period 🎉
        </p>
      )}

      {/* Horizontal card row with left/right navigation when >3 */}
      {pageSlice.length > 0 && (
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-20"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              ‹
            </button>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pageSlice.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              <ul className="flex gap-3 flex-1 min-w-0">
                {pageSlice.map((checklist) => (
                  <SortableChecklistCard key={checklist.id} checklist={checklist} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {totalPages > 1 && (
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={clampedPage === totalPages - 1}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-20"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              ›
            </button>
          )}
        </div>
      )}

      {/* Page dots (only when paginating) */}
      {totalPages > 1 && (
        <div className="flex gap-1.5 items-center justify-center">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className="rounded-full transition-all"
              style={{
                width: i === clampedPage ? '18px' : '6px',
                height: '6px',
                background: i === clampedPage ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            />
          ))}
        </div>
      )}

      {/* Show/hide completed toggle */}
      {completedCount > 0 && (
        <button
          onClick={() => setShowCompleted((s) => !s)}
          className="text-xs self-start transition-opacity opacity-50 hover:opacity-100"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {showCompleted ? '▾ Hide completed' : `▸ Show ${completedCount} completed`}
        </button>
      )}
    </div>
  );
}
