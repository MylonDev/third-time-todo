import { useMemo } from 'react';
import { useTasks } from '../store/tasks';
import { pastPeriodKeys, getPeriodKey } from '../utils/goalPeriod';
import { formatDuration } from '../utils/thirdTime';
import type { Routine, RoutinePeriodRecord } from '../types';

const PERIODS = 14;

function periodNoun(routine: Routine): string {
  if (routine.period === 'daily') return 'days';
  if (routine.period === 'weekly') return 'weeks';
  return `${routine.periodDays ?? 1}-day windows`;
}

function keyLabel(routine: Routine, key: string): string {
  if (key.startsWith('custom-')) return `Window ${Number(key.slice(7)) + 1}`;
  const d = new Date(key + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions =
    routine.period === 'weekly'
      ? { month: 'short', day: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' };
  return (routine.period === 'weekly' ? 'Week of ' : '') + d.toLocaleDateString(undefined, opts);
}

type Cell = { key: string; record?: RoutinePeriodRecord; isCurrent: boolean };

function RoutineRow({ routine }: { routine: Routine }) {
  const { routineHistory, tasks } = useTasks();

  const { cells, rate, streak, trackedMs, recorded } = useMemo(() => {
    const anchor = routine.createdAt;
    const currentKey = getPeriodKey(routine.period, routine.periodDays, anchor);
    const history = routineHistory[routine.id] ?? {};

    // The period in progress has no record yet, so read it live off the tasks.
    const liveSteps = tasks.filter(
      (t) => t.routineId === routine.id && (t.routinePeriodKey ?? currentKey) === currentKey
    );
    const live: RoutinePeriodRecord | undefined = liveSteps.length
      ? {
          done: liveSteps.filter((t) => t.status === 'done').length,
          total: liveSteps.length,
          trackedMs: liveSteps.reduce((a, t) => a + (t.trackedMs ?? 0), 0),
        }
      : undefined;

    const keys = pastPeriodKeys(routine.period, routine.periodDays, anchor, PERIODS);
    const cells: Cell[] = keys.map((key) => ({
      key,
      record: key === currentKey ? history[key] ?? live : history[key],
      isCurrent: key === currentKey,
    }));

    const closed = cells.filter((c) => !c.isCurrent && c.record);
    const rate = closed.length
      ? closed.reduce((a, c) => a + c.record!.done / Math.max(1, c.record!.total), 0) / closed.length
      : null;

    // Consecutive complete periods, counting back from the most recent closed one.
    let streak = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (c.isCurrent) {
        // An unfinished current period does not break the streak, it just doesn't add.
        if (c.record && c.record.total > 0 && c.record.done === c.record.total) streak++;
        continue;
      }
      if (c.record && c.record.total > 0 && c.record.done === c.record.total) streak++;
      else break;
    }

    const trackedMs = cells.reduce((a, c) => a + (c.record?.trackedMs ?? 0), 0);
    return { cells, rate, streak, trackedMs, recorded: closed.length };
  }, [routine, routineHistory, tasks]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
          {routine.title}
        </span>
        {rate !== null && (
          <span className="num text-xs font-semibold" style={{ color: 'var(--color-rest)' }}>
            {Math.round(rate * 100)}%
          </span>
        )}
        {streak > 1 && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span className="num">{streak}</span> in a row
          </span>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
          {trackedMs > 0 && <><span className="num">{formatDuration(trackedMs)}</span> tracked · </>}
          last <span className="num">{PERIODS}</span> {periodNoun(routine)}
        </span>
      </div>

      <div className="flex gap-1">
        {cells.map(({ key, record, isCurrent }) => {
          const ratio = record && record.total > 0 ? record.done / record.total : 0;
          const complete = ratio >= 1;
          const label = record
            ? `${keyLabel(routine, key)} — ${record.done}/${record.total}${record.skipped ? ' (skipped)' : ''}`
            : `${keyLabel(routine, key)} — no record`;
          return (
            <div
              key={key}
              title={label}
              aria-label={label}
              className="flex-1 h-6 rounded-sm overflow-hidden flex items-end"
              style={{
                background: 'var(--color-surface-2)',
                border: isCurrent ? '1px dashed var(--color-border-strong)' : 'none',
              }}
            >
              {record && ratio > 0 && (
                <div
                  className="w-full"
                  style={{
                    height: `${Math.max(ratio * 100, 12)}%`,
                    background: complete ? 'var(--color-rest)' : 'var(--color-accent)',
                    opacity: record.skipped ? 0.35 : complete ? 0.9 : 0.7,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {recorded === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Nothing recorded yet — the first bar lands when this period turns over.
        </p>
      )}
    </div>
  );
}

export function RoutineAdherence() {
  const { routines } = useTasks();
  const sorted = [...routines].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
        No routines yet. Add one from the Tasks heading and its record will build here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sorted.map((routine) => (
        <RoutineRow key={routine.id} routine={routine} />
      ))}
      <div className="flex items-center gap-4 pt-1">
        {[
          { color: 'var(--color-rest)', label: 'Every step done' },
          { color: 'var(--color-accent)', label: 'Partly done' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
