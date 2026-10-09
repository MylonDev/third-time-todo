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
    <li className="flex items-center gap-1.5 min-h-[54px] border-t border-border first:border-t-0">
      {/* The input is the visible circle; the label around it is the 44px touch target. */}
      <label className="-ml-2 flex size-11 flex-none cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={item.done}
          onChange={onToggle}
          aria-label={item.text}
          className="check press"
          style={{ '--check-color': item.kind === 'should' ? 'var(--color-moss)' : 'var(--color-want)' } as React.CSSProperties}
        />
      </label>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${item.text}`}
        className="flex-1 min-w-0 text-left py-2 cursor-pointer"
      >
        <span
          className={`block break-words text-[1.0625rem] font-medium transition-colors ${
            item.done ? 'line-through text-text-muted' : ''
          }`}
        >
          {item.text}
        </span>
        {(late > 0 || item.repeat) && (
          <span className="flex flex-wrap gap-x-3 font-timer text-[0.625rem] uppercase tracking-[0.08em] text-text-muted">
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
