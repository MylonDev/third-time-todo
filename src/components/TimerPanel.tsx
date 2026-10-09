import { useBadge } from '../hooks/useBadge';
import { useDay } from '../hooks/useDay';
import { useWakeLock } from '../hooks/useWakeLock';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import type { TimerState } from '../types';
import { formatClock, formatDuration } from '../utils/time';

const LABEL: Record<TimerState, string> = { should: 'Should', want: 'Want' };

const ACTIVE_CLASS: Record<TimerState, string> = {
  should: 'bg-accent text-on-accent',
  want: 'bg-want text-on-want',
};

/** The one thing always on screen: what you're spending time on, and the balance. */
export function TimerPanel({ onFix }: { onFix: () => void }) {
  const { now, running, totals, balance } = useDay();
  const start = useTimer((s) => s.start);
  const stop = useTimer((s) => s.stop);
  const targetMin = useSettings((s) => s.shouldTargetMin);
  const wakeLockOn = useSettings((s) => s.wakeLock);
  const badgeOn = useSettings((s) => s.badge);

  const state = running?.state ?? null;
  const elapsed = running ? now - running.startedAt : 0;
  const inDebt = balance < 0;

  const screenOn = useWakeLock(running !== undefined && wakeLockOn);
  useBadge(badgeOn, Math.floor(balance / 60_000));

  const targetMs = targetMin ? targetMin * 60_000 : null;
  const progress = targetMs ? Math.min(1, totals.shouldMs / targetMs) : 0;
  const reached = targetMs !== null && totals.shouldMs >= targetMs;

  return (
    <section
      aria-label="Timer"
      className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-4"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className={`section-label ${state === 'should' ? '!text-accent' : state === 'want' ? '!text-want' : ''}`}
          >
            {state ? `${LABEL[state]} running` : 'Resting'}
          </p>
          <p data-testid="elapsed" className="font-timer text-5xl font-semibold leading-tight">
            {running ? formatClock(elapsed) : '0:00'}
          </p>
        </div>
        <div className="text-right">
          <p className="section-label">{inDebt ? 'Want debt' : 'Want available'}</p>
          <p
            data-testid="balance"
            className={`font-timer text-3xl font-semibold ${inDebt ? 'text-debt' : 'text-want'}`}
          >
            {formatClock(balance)}
          </p>
        </div>
      </div>

      <div role="group" aria-label="Timer state" className="grid grid-cols-2 gap-3">
        {(['should', 'want'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={state === s}
            onClick={() => start(s)}
            className={`min-h-16 rounded-xl text-xl font-semibold transition-colors cursor-pointer border ${
              state === s
                ? `${ACTIVE_CLASS[s]} border-transparent`
                : 'bg-surface-2 border-border text-text hover:border-border-strong'
            }`}
          >
            {LABEL[s]}
          </button>
        ))}
      </div>

      {running && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={stop}
            className="min-h-12 rounded-xl border border-border-strong text-text font-medium cursor-pointer hover:bg-surface-2"
          >
            Stop
          </button>
          <button
            type="button"
            onClick={onFix}
            className="min-h-12 rounded-xl border border-border text-text-muted font-medium cursor-pointer hover:text-text hover:bg-surface-2"
          >
            Fix timer
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm text-text-muted">
        <p data-testid="totals">
          Today: Should <span className="num text-text">{formatDuration(totals.shouldMs)}</span> · Want{' '}
          <span className="num text-text">{formatDuration(totals.wantMs)}</span>
        </p>
        {screenOn && <p data-testid="screen-on">Screen stays on while timing.</p>}
        {targetMs !== null && (
          <div className="flex flex-col gap-1.5">
            <div
              role="progressbar"
              aria-label="Daily Should target"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              className="h-2 rounded-full bg-surface-2 overflow-hidden"
            >
              <div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            <p data-testid="target">
              {reached
                ? running
                  ? 'Target reached. You can stop for the day.'
                  : 'Target reached. Enjoy the rest of the day.'
                : `Target: ${formatDuration(totals.shouldMs)} of ${formatDuration(targetMs)}`}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
