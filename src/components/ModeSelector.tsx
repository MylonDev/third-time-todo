import { useMemo, useState } from 'react';
import { MODE_CONFIG, todayKey } from '../utils/thirdTime';
import { workMsOf } from '../utils/ledger';
import { currentVerdict } from '../utils/pace';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';
import { useDayMode } from '../hooks/useDayMode';
import { MODES, recommendMode } from '../utils/difficulty';
import type { Mode } from '../types';

const MODE_COLORS: Record<Mode, { color: string; dim: string }> = {
  quarter: { color: 'var(--color-mode-quarter)',     dim: 'var(--color-mode-quarter-dim)' },
  third:   { color: 'var(--color-mode-third)',       dim: 'var(--color-mode-third-dim)'   },
  half:    { color: 'var(--color-mode-half)',         dim: 'var(--color-mode-half-dim)'    },
};

interface Props {
  locked?: boolean;
}

export function ModeSelector({ locked = false }: Props) {
  const mode = useDayMode();
  const defaultMode = useSettings((s) => s.mode);
  const policy = useSettings((s) => s.difficultyPolicy);
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const daily = useSession((s) => s.daily);
  const history = useSession((s) => s.history);
  const setDayMode = useSession((s) => s.setDayMode);

  const [hovered, setHovered] = useState<Mode | null>(null);
  const [confirming, setConfirming] = useState<Mode | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const today = todayKey(dayEndHour);
  const verdict = useMemo(() => {
    const byDate = new Map<string, number>();
    history.forEach((h) => byDate.set(h.date, h.totalWorkMs));
    byDate.set(today, workMsOf(daily.entries));
    return currentVerdict(byDate, today);
  }, [history, daily.entries, today]);

  const yesterday =
    [...history].filter((h) => h.date < today).sort((a, b) => b.date.localeCompare(a.date))[0]?.mode ??
    defaultMode;
  const recommended = recommendMode(verdict, yesterday);

  const started = daily.entries.length > 0;
  const outOfReductions =
    started && policy.kind === 'quota' && (daily.reductionsUsed ?? 0) >= policy.perDay;
  const blocked = (m: Mode) => outOfReductions && MODE_CONFIG[m].ratio < MODE_CONFIG[mode].ratio;

  const choose = (m: Mode) => {
    if (locked || m === mode) return;
    // Raising is never refused, but when you're already ramping fast it asks
    // once before going ahead.
    if (verdict === 'above' && MODE_CONFIG[m].ratio > MODE_CONFIG[mode].ratio && confirming !== m) {
      setConfirming(m);
      return;
    }
    setConfirming(null);
    setRefusal(setDayMode(m));
  };

  const reductionsLeft =
    policy.kind === 'quota' ? Math.max(0, policy.perDay - (daily.reductionsUsed ?? 0)) : null;

  // Description to show — prefer hovered, then active
  const descMode = hovered ?? mode;
  const descCfg = MODE_CONFIG[descMode];
  const descColors = MODE_COLORS[descMode];

  return (
    <div className="flex flex-col gap-2.5">
      {/* Pills row — equal columns that shrink rather than overflow on narrow screens */}
      <div className="grid grid-cols-3 gap-1.5 items-center" role="group" aria-label="Today’s difficulty">
        {MODES.map((m) => {
          const cfg = MODE_CONFIG[m];
          const colors = MODE_COLORS[m];
          const isActive = mode === m;
          const disabled = !isActive && blocked(m);

          return (
            <button
              key={m}
              onClick={() => choose(m)}
              onMouseEnter={() => !locked && setHovered(m)}
              onMouseLeave={() => setHovered(null)}
              aria-pressed={isActive}
              disabled={disabled}
              title={disabled ? 'No reductions left today' : undefined}
              className="relative flex flex-col items-center min-w-0 px-3 py-2 rounded-xl text-sm font-semibold transition-all select-none"
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
                      opacity: locked || disabled ? 0.35 : 0.7,
                      cursor: locked || disabled ? 'not-allowed' : 'pointer',
                    }
              }
            >
              <span className="whitespace-nowrap" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                {cfg.label}
              </span>
              <span className="num text-xs font-normal mt-0.5" style={{ opacity: 0.75 }}>
                1:{cfg.ratio}
              </span>
              {recommended === m && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-px rounded-full"
                  style={{
                    background: 'var(--color-surface)',
                    color: colors.color,
                    border: `1px solid ${colors.color}`,
                  }}
                  aria-label="Suggested for today"
                >
                  suggested
                </span>
              )}
              {isActive && locked && recommended !== m && (
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

      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Raise difficulty?"
          className="flex flex-wrap items-center gap-2 text-[13px] rounded-xl border px-3 py-2"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <span className="flex-1">You’ve been ramping fast lately. Raise anyway?</span>
          <button
            onClick={() => choose(confirming)}
            className="rounded-lg border px-2 py-0.5 font-semibold"
            style={{ borderColor: MODE_COLORS[confirming].color, color: MODE_COLORS[confirming].color }}
          >
            Raise to {MODE_CONFIG[confirming].label}
          </button>
          <button
            onClick={() => setConfirming(null)}
            className="rounded-lg border px-2 py-0.5"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Keep {MODE_CONFIG[mode].label}
          </button>
        </div>
      ) : refusal || outOfReductions ? (
        <p role="status" className="text-[13px]" style={{ color: 'var(--color-debt)', paddingLeft: '2px' }}>
          {refusal ?? 'No reductions left today — you can still raise it.'}
        </p>
      ) : (
        /* Description line — always visible, transitions between modes on hover */
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
          {started && reductionsLeft !== null && reductionsLeft > 0 && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {' '}· {reductionsLeft} reduction{reductionsLeft === 1 ? '' : 's'} left today
            </span>
          )}
        </p>
      )}
    </div>
  );
}
