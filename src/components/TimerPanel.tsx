import { useMemo, useState } from 'react';
import { useChimes } from '../hooks/useChimes';
import { useDay } from '../hooks/useDay';
import { useNextStepPrompt } from '../hooks/useNextStepPrompt';
import { useSettleTimed } from '../hooks/useSettleTimed';
import { useWakeLock } from '../hooks/useWakeLock';
import { useGetReady } from '../store/getReady';
import { usePractices } from '../store/practices';
import { useSettings } from '../store/settings';
import { useTimer } from '../store/timer';
import type { TimerState } from '../types';
import { shouldOfferGetReady } from '../utils/getReady';
import { RATIO } from '../utils/ledger';
import { LEVELS, listPractices } from '../utils/practices';
import { dayKeyOf, formatClock, formatDuration } from '../utils/time';
import { GetReadyModal } from './GetReadyModal';
import { Modal } from './Modal';
import { NeedsAttention } from './NeedsAttention';
import { NextStepModal } from './NextStepModal';
import { Scene } from './Scene';
import { Segmented } from './Segmented';
import { sceneInk, seasonOf, timeOfDayOf } from './sceneTheme';
import { TimedStart } from './TimedStart';

const LABEL: Record<TimerState, string> = { should: 'Focus', want: 'Rest' };

type Mode = 'flow' | 'timed';

const MODES = [
  { value: 'flow', label: 'Flow' },
  { value: 'timed', label: 'Timed' },
] as const;

/** With no daily target the sun still needs a pace: this many hours of Focus takes it to the top. */
const DEFAULT_SCALE_MS = 4 * 3_600_000;

const TILE: Record<TimerState, { fill: string; sub: string; subRunning: string }> = {
  should: { fill: 'bg-should text-on-should', sub: 'Earns 1:3', subRunning: 'Running' },
  want: { fill: 'bg-want text-on-want', sub: 'Spends 1:1', subRunning: 'Running' },
};

/** The one thing always on screen: what you're spending time on, and the balance. */
export function TimerPanel({ onFix }: { onFix: () => void }) {
  const { now, running, totals, balance, carried } = useDay();
  const start = useTimer((s) => s.start);
  const startTimed = useTimer((s) => s.startTimed);
  const stop = useTimer((s) => s.stop);
  const targetMin = useSettings((s) => s.shouldTargetMin);
  const wakeLockOn = useSettings((s) => s.wakeLock);
  const getReadySteps = useSettings((s) => s.getReadySteps);
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const recordGetReady = useGetReady((s) => s.record);
  // Which kind of session the next start begins. Only chosen while stopped.
  const [mode, setMode] = useState<Mode>('flow');
  const [confirmingStop, setConfirmingStop] = useState(false);
  // A start waiting on the Get ready checklist.
  const [pending, setPending] = useState<(() => void) | null>(null);
  // The practice the next start is for. Locked while a session runs.
  const [forId, setForId] = useState('');
  const allPractices = usePractices((s) => s.practices);
  const practices = useMemo(() => listPractices(allPractices), [allPractices]);

  useSettleTimed();
  useChimes();
  const [askedFor, dismissAsk] = useNextStepPrompt();

  const state = running?.state ?? null;
  const elapsed = running ? now - running.startedAt : 0;
  // A Timed session counts down from its planned length.
  const plannedMs = running?.state === 'timed' ? (running.plannedMs ?? 0) : null;
  const inDebt = balance < 0;

  const screenOn = useWakeLock(running !== undefined && wakeLockOn);

  const targetMs = targetMin ? targetMin * 60_000 : null;
  const progress = plannedMs !== null ? Math.min(1, elapsed / plannedMs) : Math.min(1, totals.shouldMs / (targetMs ?? DEFAULT_SCALE_MS));
  const targetProgress = targetMs ? Math.min(1, totals.shouldMs / targetMs) : 0;
  const reached = targetMs !== null && totals.shouldMs >= targetMs;

  // Past the day end the balance has carried on, and stopping is what clears it.
  // Debt, zero or under half a minute (which would read as 0m) stops without asking.
  const stopClears = carried && balance >= 30_000;
  const onStop = () => (stopClears ? setConfirmingStop(true) : stop());

  const scene = state ?? 'stopped';
  const date = new Date(now);
  const time = timeOfDayOf(date);
  const clock = plannedMs !== null ? formatClock(Math.max(0, plannedMs - elapsed)) : running ? formatClock(elapsed) : '0:00';
  // A deleted practice is no longer named, but its time stays on the entry.
  const selected = practices.find((p) => p.id === (running ? running.practiceId : forId));
  const headline = `${state === 'timed' ? 'Timed running' : state ? `${LABEL[state]} running` : 'Stopped'}${running && selected ? ` · ${selected.name}` : ''}`;
  // Only a start from stopped names a practice; switching while running keeps the running one.
  const practiceId = running ? undefined : selected?.id;
  const asking = practices.find((p) => p.id === askedFor);

  // Starting from stopped is offered the checklist the first time in a day. Switching while running never is.
  // Everything is read at the press, not from the render, so a day that turned over since is the day recorded.
  const begin = (go: () => void) => {
    const now = Date.now();
    const offer =
      !running && shouldOfferGetReady(getReadySteps, useGetReady.getState().days, useTimer.getState().entries, dayKeyOf(now, dayEndHour), dayEndHour);
    if (offer) setPending(() => go);
    else go();
  };
  const answerGetReady = (done: string[], skipped: boolean) => {
    recordGetReady(dayKeyOf(Date.now(), dayEndHour), done, skipped);
    // Another tab or a sync may have started a session while the modal was open.
    if (!running) pending?.();
    setPending(null);
  };

  return (
    <section aria-label="Timer" className="flex flex-col gap-4">
      <div className="relative h-[310px] overflow-hidden rounded-[28px]">
        <Scene mode={scene} progress={progress} season={seasonOf(date)} time={time} />
        <div className="absolute left-[18px] top-4" style={{ color: sceneInk(scene, time), transition: 'color .7s' }}>
          <p className="section-label !text-current flex items-center gap-2 !tracking-[0.14em]">
            {running && <span className="beat size-2 rounded-full bg-current" aria-hidden="true" />}
            {headline}
          </p>
          <p data-testid="elapsed" className={`font-timer mt-1.5 font-bold leading-none ${clock.length > 5 ? 'text-[2.6rem]' : 'text-[3.75rem]'}`}>
            {clock}
          </p>
          {plannedMs !== null && (
            <p data-testid="planned" className="font-timer mt-2 text-sm font-semibold">
              of {formatDuration(plannedMs)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="section-label">{inDebt ? 'Rest debt' : 'Rest available'}</p>
          <p
            data-testid="balance"
            className={`font-timer text-[2.125rem] font-bold leading-[1.1] ${inDebt ? 'text-debt' : ''}`}
            style={{ transition: 'color .4s' }}
          >
            {formatClock(balance)}
          </p>
          {inDebt && (
            <p data-testid="debt-hint" className="text-sm text-text-muted">
              {/* Focus pays back 1:RATIO, so clearing the debt takes RATIO times as much. */}
              {formatDuration(Math.max(60_000, -balance * RATIO))} of Focus clears it
            </p>
          )}
        </div>
        {targetMs !== null && (
          <div className="text-right">
            <p className="section-label">Daily target</p>
            <p className="font-timer text-[2.125rem] font-bold leading-[1.1]">{Math.round(targetProgress * 100)}%</p>
          </div>
        )}
      </div>

      {practices.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="section-label">
              For
            </span>
            <select
              aria-label="For"
              value={selected?.id ?? ''}
              disabled={running !== undefined}
              onChange={(e) => setForId(e.target.value)}
              className="min-h-12 min-w-0 flex-1 cursor-pointer rounded-2xl border border-border bg-surface-2 px-4 text-base text-text outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">None</option>
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.level === 'paused' ? `${p.name} (paused)` : p.name}
                </option>
              ))}
            </select>
          </div>
          {selected?.nextStep && (
            <p data-testid="next-step" className="text-sm text-text-muted">
              Next: <span className="text-text">{selected.nextStep}</span>
            </p>
          )}
        </div>
      )}

      {!running && <Segmented<Mode> label="Timer mode" value={mode} options={[...MODES]} onChange={setMode} />}

      {!running && mode === 'timed' && (
        <TimedStart
          // Picking a practice starts the length at its level's minimum.
          key={selected?.id ?? ''}
          initialMinutes={selected && LEVELS[selected.level].minMin > 0 ? LEVELS[selected.level].minMin : undefined}
          onStart={(ms) => begin(() => startTimed(ms, practiceId))}
        />
      )}

      {(state === 'should' || state === 'want' || (!running && mode === 'flow')) && (
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
                onClick={() => begin(() => start(s, practiceId))}
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
      )}

      {running && (
        <div className="pop grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onStop}
            className="press min-h-12 cursor-pointer rounded-3xl border border-border-strong bg-transparent font-semibold text-text"
          >
            Stop
          </button>
          {state !== 'timed' && (
            <button
              type="button"
              onClick={onFix}
              className="press min-h-12 cursor-pointer rounded-3xl border border-border bg-transparent font-medium text-text-muted hover:text-text"
            >
              Fix timer
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm text-text-muted">
        <p data-testid="totals">
          Today: Focus <span className="num text-text">{formatDuration(totals.shouldMs)}</span> · Rest{' '}
          <span className="num text-text">{formatDuration(totals.wantMs)}</span>
          {totals.timedMs > 0 && (
            <>
              {' '}
              · Timed <span className="num text-text">{formatDuration(totals.timedMs)}</span>
            </>
          )}
        </p>
        {screenOn && <p data-testid="screen-on">Screen stays on while timing.</p>}
        {targetMs !== null && (
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label="Daily Focus target"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(targetProgress * 100)}
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div className="h-full rounded-full bg-moss transition-[width] duration-1000 ease-linear" style={{ width: `${targetProgress * 100}%` }} />
            </div>
            {reached ? (
              <div role="status" className="pop flex items-center gap-3.5 rounded-3xl border border-moss-edge px-4 py-3.5 text-text">
                <span aria-hidden="true" className="relative flex size-10 flex-none items-center justify-center">
                  <span className="halo absolute size-[22px] rounded-full bg-moss" />
                  <span className="relative size-[22px] rounded-full bg-moss" />
                </span>
                <p data-testid="target" className="text-[0.9375rem] leading-snug">
                  <strong className="text-lg font-bold">Target reached.</strong> {running ? 'You can stop for the day.' : 'Enjoy the rest of the day.'}
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
      {!running && <NeedsAttention selectedId={selected?.id} onPick={setForId} />}
      {pending && (
        <GetReadyModal
          steps={getReadySteps}
          onStart={(done) => answerGetReady(done, false)}
          onSkip={() => answerGetReady([], true)}
          onClose={() => setPending(null)}
        />
      )}
      {asking && <NextStepModal practice={asking} onClose={dismissAsk} />}
      {confirmingStop && stopClears && (
        <Modal label="Stop the timer" onClose={() => setConfirmingStop(false)} size="sm" className="p-5 gap-5">
          <div>
            <h2 className="text-lg font-semibold">Stop the timer?</h2>
            <p data-testid="stop-clears" className="text-sm text-text-muted">
              Stopping clears {formatDuration(balance)} of rest.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirmingStop(false)}
              className="press min-h-12 cursor-pointer rounded-full border border-border font-medium text-text-muted hover:text-text"
            >
              Keep going
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingStop(false);
                stop();
              }}
              className="press min-h-12 cursor-pointer rounded-full bg-accent font-semibold text-on-accent"
            >
              Stop
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
