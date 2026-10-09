import type { Item } from '../types';
import { overdueDays } from '../utils/items';
import { recurrenceLabel } from '../utils/recurrence';

export function ItemRow({
  item,
  today,
  onToggle,
  onEdit,
}: {
  item: Item;
  today: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const late = overdueDays(item, today);
  return (
    <li className="flex items-center gap-3 min-h-12 px-3 py-1 border-t border-border first:border-t-0">
      <input
        type="checkbox"
        checked={item.done}
        onChange={onToggle}
        aria-label={item.text}
        className={`size-6 shrink-0 cursor-pointer ${item.kind === 'should' ? 'accent-accent' : 'accent-want'}`}
      />
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${item.text}`}
        className="flex-1 min-w-0 text-left py-2 cursor-pointer"
      >
        <span className={`block break-words ${item.done ? 'line-through text-text-muted' : ''}`}>
          {item.text}
        </span>
        {(late > 0 || item.repeat) && (
          <span className="flex flex-wrap gap-x-3 text-xs text-text-muted">
            {late > 0 && (
              <span className="text-debt">{late === 1 ? '1 day overdue' : `${late} days overdue`}</span>
            )}
            {item.repeat && <span>↻ {recurrenceLabel(item.repeat)}</span>}
          </span>
        )}
      </button>
    </li>
  );
}
