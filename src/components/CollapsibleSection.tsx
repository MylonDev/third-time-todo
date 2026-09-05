import type { ReactNode } from 'react';

interface Props {
  label: string;
  /** Short status shown beside the label, and the only content when collapsed. */
  summary?: ReactNode;
  /** Optional control pinned to the right of the header. */
  action?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleSection({
  label,
  summary,
  action,
  collapsed,
  onToggle,
  children,
}: Props) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5 flex-wrap mb-3">
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex items-baseline gap-2 text-left"
        >
          {/* Fixed width so every section label starts on the same x, whichever
              way the caret is pointing. */}
          <span
            className="text-[9px] w-3 text-center transition-transform flex-shrink-0"
            style={{
              color: 'var(--color-text-muted)',
              display: 'inline-block',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
            aria-hidden="true"
          >
            ▼
          </span>
          <h2
            className="text-[15px] font-semibold leading-none"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            {label}
          </h2>
        </button>
        {summary && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {summary}
          </span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {!collapsed && children}
    </section>
  );
}
