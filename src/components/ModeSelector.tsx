import { useState } from 'react';
import { MODE_CONFIG } from '../utils/thirdTime';
import { useSettings } from '../store/settings';
import type { Mode } from '../types';

const MODES: Mode[] = ['quarter', 'third', 'half'];

const MODE_COLORS: Record<Mode, { color: string; dim: string }> = {
  quarter: { color: 'var(--color-mode-quarter)',     dim: 'var(--color-mode-quarter-dim)' },
  third:   { color: 'var(--color-mode-third)',       dim: 'var(--color-mode-third-dim)'   },
  half:    { color: 'var(--color-mode-half)',         dim: 'var(--color-mode-half-dim)'    },
};

interface Props {
  locked?: boolean;
}

export function ModeSelector({ locked = false }: Props) {
  const { mode, setMode } = useSettings();
  const [hovered, setHovered] = useState<Mode | null>(null);

  // Description to show — prefer hovered, then active
  const descMode = hovered ?? mode;
  const descCfg = MODE_CONFIG[descMode];
  const descColors = MODE_COLORS[descMode];

  return (
    <div className="flex flex-col gap-2.5">
      {/* Pills row — equal-width buttons */}
      <div className="flex gap-1.5 items-center">
        {MODES.map((m) => {
          const cfg = MODE_CONFIG[m];
          const colors = MODE_COLORS[m];
          const isActive = mode === m;

          return (
            <button
              key={m}
              onClick={() => !locked && setMode(m)}
              onMouseEnter={() => !locked && setHovered(m)}
              onMouseLeave={() => setHovered(null)}
              className="relative flex flex-col items-center min-w-[7rem] px-3 py-2 rounded-xl text-sm font-semibold transition-all select-none"
              style={
                isActive
                  ? {
                      background: colors.dim,
                      color: colors.color,
                      border: `1px solid ${colors.color}`,
                      opacity: 1,
                    }
                  : {
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-text-muted)',
                      border: '1px solid var(--color-border)',
                      opacity: locked ? 0.35 : 0.7,
                      cursor: locked ? 'default' : 'pointer',
                    }
              }
            >
              <span className="whitespace-nowrap" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                {cfg.label}
              </span>
              <span className="text-xs font-normal mt-0.5" style={{ opacity: 0.65 }}>
                1:{cfg.ratio}
              </span>
              {isActive && locked && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-px rounded-full"
                  style={{
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-muted)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  locked
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Description line — always visible, transitions between modes on hover */}
      <p
        className="text-[13px] transition-all duration-100"
        style={{
          color: descColors.color,
          opacity: 0.8,
          minHeight: '1.1rem',
          paddingLeft: '2px',
          fontFamily: 'var(--font-body)',
        }}
      >
        {descCfg.description}
      </p>
    </div>
  );
}
