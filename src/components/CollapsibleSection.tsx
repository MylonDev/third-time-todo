import type { ReactNode } from 'react';

interface Props {
  label: string;
  /** Short status shown beside the label, and the only content when collapsed. */
  summary?: ReactNode;
  /** Optional control pinned to the right of the header. */
  action?: ReactNode;
  /** Renders the label larger and in full contrast, for the page's primary section. */
  prominent?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleSection({
  label,
  summary,
  action,
  prominent = false,
  collapsed,
  onToggle,
  children,
}: Props) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5 flex-wrap mb-2.5">
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex items-baseline gap-1.5 text-left"
        >
          <span
            className="text-[10px] transition-transform"
            style={{
              color: 'var(--color-text-muted)',
              display: 'inline-block',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
            aria-hidden="true"
          >
            ▼
          </span>
          {prominent ? (
            <h2
              className="text-[15px] font-semibold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
            >
              {label}
            </h2>
          ) : (
            <h2 className="section-label">{label}</h2>
          )}
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
