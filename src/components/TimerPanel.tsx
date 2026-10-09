import { useDay } from '../hooks/useDay';
import { useWakeLock } from '../hooks/useWakeLock';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import type { TimerState } from '../types';
import { formatClock, formatDuration } from '../utils/time';
import { Scene } from './Scene';
import { sceneInk, seasonOf, timeOfDayOf } from './sceneTheme';

const LABEL: Record<TimerState, string> = { should: 'Should', want: 'Want' };

/** With no daily target the sun still needs a pace: this many hours of Should takes it to the top. */
const DEFAULT_SCALE_MS = 4 * 3_600_000;

const TILE: Record<TimerState, { fill: string; sub: string; subRunning: string }> = {
  should: { fill: 'bg-should text-on-should', sub: 'Earns 1:3', subRunning: 'Running' },
  want: { fill: 'bg-want text-on-want', sub: 'Spends 1:1', subRunning: 'Running' },
};

/** The one thing always on screen: what you're spending time on, and the balance. */
export function TimerPanel({ onFix }: { onFix: () => void }) {
  const { now, running, totals, balance } = useDay();
  const start = useTimer((s) => s.start);
  const stop = useTimer((s) => s.stop);
  const targetMin = useSettings((s) => s.shouldTargetMin);
  const wakeLockOn = useSettings((s) => s.wakeLock);

  const state = running?.state ?? null;
  const elapsed = running ? now - running.startedAt : 0;
  const inDebt = balance < 0;

  const screenOn = useWakeLock(running !== undefined && wakeLockOn);

  const targetMs = targetMin ? targetMin * 60_000 : null;
  const progress = Math.min(1, totals.shouldMs / (targetMs ?? DEFAULT_SCALE_MS));
  const targetProgress = targetMs ? Math.min(1, totals.shouldMs / targetMs) : 0;
  const reached = targetMs !== null && totals.shouldMs >= targetMs;

  const mode = state ?? 'rest';
  const date = new Date(now);
  const time = timeOfDayOf(date);
  const clock = running ? formatClock(elapsed) : '0:00';

  return (
    <section aria-label="Timer" className="flex flex-col gap-4">
      <div className="relative h-[310px] overflow-hidden rounded-[28px]">
        <Scene mode={mode} progress={progress} season={seasonOf(date)} time={time} />
        <div className="absolute left-[18px] top-4" style={{ color: sceneInk(mode, time), transition: 'color .7s' }}>
          <p className="section-label !text-current flex items-center gap-2 !tracking-[0.14em]">
            {running && <span className="beat size-2 rounded-full bg-current" aria-hidden="true" />}
            {state ? `${LABEL[state]} running` : 'Resting'}
          </p>
          <p
            data-testid="elapsed"
            className={`font-timer mt-1.5 font-bold leading-none ${clock.length > 5 ? 'text-[2.6rem]' : 'text-[3.75rem]'}`}
          >
            {clock}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="section-label">{inDebt ? 'Want debt' : 'Want available'}</p>
          <p
            data-testid="balance"
            className={`font-timer text-[2.125rem] font-bold leading-[1.1] ${inDebt ? 'text-debt' : ''}`}
            style={{ transition: 'color .4s' }}
          >
            {formatClock(balance)}
          </p>
        </div>
        {targetMs !== null && (
          <div className="text-right">
            <p className="section-label">Daily target</p>
            <p className="font-timer text-[2.125rem] font-bold leading-[1.1]">{Math.round(targetProgress * 100)}%</p>
          </div>
        )}
      </div>

      <div role="group" aria-label="Timer state" className="grid grid-cols-2 gap-3">
        {(['should', 'want'] as const).map((s) => {
          const active = state === s;
          const dimmed = state !== null && !active;
          return (
            <button
              key={s}
              type="button"
              aria-label={LABEL[s]}
              aria-pressed={active}
              onClick={() => start(s)}
              className={`press flex min-h-[92px] cursor-pointer flex-col justify-end rounded-3xl border-0 px-[18px] py-3.5 text-left transition-[opacity,box-shadow] duration-300 ${TILE[s].fill}`}
              style={{
                opacity: dimmed ? 0.45 : 1,
                boxShadow: active ? '0 0 0 3px var(--color-bg), 0 0 0 5px var(--color-text)' : '0 0 0 0 var(--color-bg)',
              }}
            >
              <span aria-hidden="true" className="text-[1.75rem] font-bold leading-none tracking-tight">
                {LABEL[s]}
              </span>
              <span aria-hidden="true" className="mt-1 font-timer text-[0.625rem] font-semibold uppercase tracking-[0.1em]">
                {active ? TILE[s].subRunning : TILE[s].sub}
              </span>
            </button>
          );
        })}
      </div>

      {running && (
        <div className="pop grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={stop}
            className="press min-h-12 cursor-pointer rounded-3xl border border-border-strong bg-transparent font-semibold text-text"
          >
            Stop
          </button>
          <button
            type="button"
            onClick={onFix}
            className="press min-h-12 cursor-pointer rounded-3xl border border-border bg-transparent font-medium text-text-muted hover:text-text"
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
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label="Daily Should target"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(targetProgress * 100)}
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-moss transition-[width] duration-1000 ease-linear"
                style={{ width: `${targetProgress * 100}%` }}
              />
            </div>
            {reached ? (
              <div role="status" className="pop flex items-center gap-3.5 rounded-3xl border border-moss-edge px-4 py-3.5 text-text">
                <span aria-hidden="true" className="relative flex size-10 flex-none items-center justify-center">
                  <span className="halo absolute size-[22px] rounded-full bg-moss" />
                  <span className="relative size-[22px] rounded-full bg-moss" />
                </span>
                <p data-testid="target" className="text-[0.9375rem] leading-snug">
                  <strong className="text-lg font-bold">Target reached.</strong>{' '}
                  {running ? 'You can stop for the day.' : 'Enjoy the rest of the day.'}
                </p>
              </div>
            ) : (
              <p data-testid="target">
                Target: {formatDuration(totals.shouldMs)} of {formatDuration(targetMs)}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
