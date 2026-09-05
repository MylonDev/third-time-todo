import { useEffect, useRef, useState } from 'react';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  /** Renders in the debt colour. Destructive actions sit last. */
  danger?: boolean;
}

/**
 * The `⋯` menu on tasks, subtasks and goals.
 *
 * All three were the same component written out three times, each with its own
 * copy of the outside-click effect and its own inline hover handlers. The hover
 * states are Tailwind now, and the menu announces itself properly.
 */
export function ActionMenu({
  actions,
  label,
  triggerClassName = 'w-7 h-7 opacity-60 hover:opacity-100 hover:bg-[var(--color-surface-2)]',
  offsetClassName = 'top-8',
  widthClassName = 'min-w-[160px]',
}: {
  actions: MenuAction[];
  /** Names the trigger, e.g. "Task actions". */
  label: string;
  triggerClassName?: string;
  offsetClassName?: string;
  widthClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        // The rows underneath are click-to-focus, so a menu click must not
        // reach them.
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`flex items-center justify-center rounded-lg text-sm transition-all ${triggerClassName}`}
        style={{ color: 'var(--color-text-muted)' }}
        title="Actions"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute right-0 z-20 rounded-xl shadow-xl py-1 border ${offsetClassName} ${widthClassName}`}
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          {actions.map(({ label: itemLabel, onSelect, danger }) => (
            <button
              key={itemLabel}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onSelect();
              }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                danger
                  ? 'hover:bg-[var(--color-debt-dim)]'
                  : 'hover:bg-[var(--color-surface-2)]'
              }`}
              style={{ color: danger ? 'var(--color-debt)' : 'var(--color-text)' }}
            >
              {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
