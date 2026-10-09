import { useState } from 'react';
import { useDay } from '../hooks/useDay';
import { useItems } from '../store/items';
import type { Item, TimerState } from '../types';
import { laterItems, todayItems } from '../utils/items';
import { describeDay } from '../utils/time';
import { ItemEditor } from './ItemEditor';
import { ItemRow } from './ItemRow';

export type View = 'today' | 'later';

const TITLE: Record<TimerState, string> = { should: 'Should', want: 'Want' };

function AddItem({ kind, onAdd }: { kind: TimerState; onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text);
        setText('');
      }}
      className="border-t border-dashed border-border-strong/40"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Add to ${TITLE[kind]}`}
        placeholder={kind === 'should' ? 'Add something you should do…' : 'Add something you want to do…'}
        enterKeyHint="done"
        className="w-full min-h-12 bg-transparent text-base text-text placeholder:text-text-muted outline-none"
      />
    </form>
  );
}

/** A dashed outline with the sun waiting on the horizon: nothing here yet. */
function Empty({ kind, text }: { kind: TimerState; text: string }) {
  const color = kind === 'should' ? 'var(--color-moss)' : 'var(--color-want)';
  return (
    <div className="pop flex items-center gap-3.5 rounded-3xl border border-dashed border-border-strong/50 p-4">
      <svg aria-hidden="true" width="56" height="36" viewBox="0 0 56 36" className="flex-none">
        <path d="M0 29H56" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M14 29a14 14 0 0 1 28 0Z" fill={color} />
      </svg>
      <p className="text-[1.0625rem] font-semibold">{text}</p>
    </div>
  );
}

function Section({
  kind,
  items,
  today,
  grouped,
  empty,
  onAdd,
  onEdit,
}: {
  kind: TimerState;
  items: Item[];
  today: string;
  grouped: boolean;
  empty: string;
  onAdd: (text: string) => void;
  onEdit: (item: Item) => void;
}) {
  const toggle = useItems((s) => s.toggle);

  // In Later, a small heading marks where each date begins.
  const rows: React.ReactNode[] = [];
  let lastDue: string | null | undefined;
  for (const item of items) {
    if (grouped && item.dueOn !== lastDue) {
      lastDue = item.dueOn;
      rows.push(
        <li key={`h-${item.dueOn}`} className="section-label pt-3.5 pb-2 border-t border-border first:border-t-0">
          {item.dueOn === null ? 'Someday' : describeDay(item.dueOn, today)}
        </li>
      );
    }
    rows.push(
      <ItemRow
        key={item.id}
        item={item}
        today={today}
        onToggle={() => toggle(item.id)}
        onEdit={() => onEdit(item)}
      />
    );
  }

  const done = items.filter((i) => i.done).length;

  return (
    <section aria-label={TITLE[kind]}>
      <div className="flex items-center gap-3 pb-1.5">
        <h2 className="text-[1.375rem] font-bold tracking-tight">{TITLE[kind]}</h2>
        <span aria-hidden="true" className="flex-1 border-t border-border" />
        <span className="num text-[0.6875rem] text-text-muted">
          {done}/{items.length}
        </span>
      </div>
      {items.length === 0 ? <Empty kind={kind} text={empty} /> : <ul>{rows}</ul>}
      <AddItem kind={kind} onAdd={onAdd} />
    </section>
  );
}

/** Today or Later, each with a Should and a Want list. */
export function ItemsView({ view }: { view: View }) {
  const { today, win } = useDay();
  const items = useItems((s) => s.items);
  const add = useItems((s) => s.add);
  const [editing, setEditing] = useState<string | null>(null);

  // Look the item up by id so the editor sees the saved version, and closes if it is gone.
  const editingItem = editing ? items.find((i) => i.id === editing && i.deletedAt === undefined) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {(['should', 'want'] as const).map((kind) => (
        <Section
          key={kind}
          kind={kind}
          items={view === 'today' ? todayItems(items, kind, today, win) : laterItems(items, kind, today)}
          today={today}
          grouped={view === 'later'}
          empty={view === 'today' ? 'Nothing for today.' : 'Nothing saved for later.'}
          onAdd={(text) => add({ text, kind, dueOn: view === 'today' ? today : null })}
          onEdit={(item) => setEditing(item.id)}
        />
      ))}

      {editingItem && <ItemEditor item={editingItem} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}
