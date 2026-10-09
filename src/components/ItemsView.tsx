import { useState } from 'react';
import { useDay } from '../hooks/useDay';
import { useItems } from '../store/items';
import type { Item, TimerState } from '../types';
import { laterItems, todayItems } from '../utils/items';
import { describeDay } from '../utils/time';
import { ItemEditor } from './ItemEditor';
import { ItemRow } from './ItemRow';
import { Segmented } from './Segmented';

type View = 'today' | 'later';

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
      className="p-2 border-t border-border"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Add to ${TITLE[kind]}`}
        placeholder={kind === 'should' ? 'Add something you should do…' : 'Add something you want to do…'}
        enterKeyHint="done"
        className="w-full min-h-11 rounded-lg px-3 bg-transparent text-text placeholder:text-text-muted outline-none"
      />
    </form>
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
        <li key={`h-${item.dueOn}`} className="section-label px-3 pt-3 pb-1 border-t border-border first:border-t-0">
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

  return (
    <section
      aria-label={TITLE[kind]}
      className={`rounded-2xl border bg-surface ${kind === 'should' ? 'border-accent-edge' : 'border-want-edge'}`}
    >
      <h2
        className={`section-label px-4 pt-3 pb-2 ${kind === 'should' ? '!text-accent' : '!text-want'}`}
      >
        {TITLE[kind]}
      </h2>
      {items.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-text-muted">{empty}</p>
      ) : (
        <ul>{rows}</ul>
      )}
      <AddItem kind={kind} onAdd={onAdd} />
    </section>
  );
}

/** Today and Later, each with a Should and a Want list. */
export function ItemsView() {
  const { today, win } = useDay();
  const items = useItems((s) => s.items);
  const add = useItems((s) => s.add);
  const [view, setView] = useState<View>('today');
  const [editing, setEditing] = useState<string | null>(null);

  // Look the item up by id so the editor sees the saved version, and closes if it is gone.
  const editingItem = editing ? items.find((i) => i.id === editing && i.deletedAt === undefined) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Segmented<View>
        label="View"
        value={view}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'later', label: 'Later' },
        ]}
        onChange={setView}
      />

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
