import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../store/session';
import { earnBreak, formatDuration, todayKey } from '../utils/thirdTime';
import { RoutineAdherence } from './RoutineAdherence';
import { PaceChart } from './PaceChart';
import type { HistoryEntry, SessionLog } from '../types';

const DAYS = 14;
const PLOT_HEIGHT = 116;

type Day = {
  date: string;
  activeMs: number;
  restTakenMs: number;
  restEarnedMs: number;
  sessions: SessionLog[];
  isToday: boolean;
  isWeekend: boolean;
};

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function shiftKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Rest the day's work actually earned — summed per block, since mode can change. */
function restEarned(sessions: SessionLog[]): number {
  return sessions.reduce((total, s) => total + earnBreak(s.workMs, s.mode), 0);
}

function dayLabel(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
}

function fullDayLabel(dateStr: string, isToday: boolean): string {
  if (isToday) return 'Today';
  return parseDate(dateStr).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function clockLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The shape of one day: every work block laid out on a wall-clock axis, with the
 * rest that followed it. Turns "4h 12m" into "three long blocks and a
 * fragmented afternoon".
 */
function DayShape({ sessions }: { sessions: SessionLog[] }) {
  const blocks = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  if (blocks.length === 0) return null;

  const start = blocks[0].startedAt;
  const end = Math.max(...blocks.map((s) => s.startedAt + s.workMs + s.breakMs));
  const span = Math.max(end - start, 60_000);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="relative h-6 rounded-md overflow-hidden"
        style={{ background: 'var(--color-surface-2)' }}
      >
        <div className="absolute inset-0">
          {blocks.map((s) => {
            const left = ((s.startedAt - start) / span) * 100;
            const workW = (s.workMs / span) * 100;
            const restW = (s.breakMs / span) * 100;
            return (
              <div key={s.id}>
                <div
                  className="absolute inset-y-0 rounded-sm"
                  style={{ left: `${left}%`, width: `${Math.max(workW, 0.6)}%`, background: 'var(--color-accent)' }}
                  title={`Active ${formatDuration(s.workMs)} from ${clockLabel(s.startedAt)}`}
                />
                {restW > 0 && (
                  <div
                    className="absolute inset-y-0 rounded-sm"
                    style={{
                      left: `${left + workW}%`,
                      width: `${Math.max(restW, 0.4)}%`,
                      background: 'var(--color-rest)',
                      opacity: 0.75,
                    }}
                    title={`Rest ${formatDuration(s.breakMs)}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        <span className="num">{clockLabel(start)}</span>
        <span>
          {blocks.length} block{blocks.length === 1 ? '' : 's'} · longest{' '}
          <span className="num">{formatDuration(Math.max(...blocks.map((s) => s.workMs)))}</span>
        </span>
        <span className="num">{clockLabel(end)}</span>
      </div>
    </div>
  );
}

export function Activity() {
  const { daily, history, timerState } = useSession();
  const today = todayKey();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'sessions' | 'routines' | 'pace'>('sessions');

  const days: Day[] = useMemo(() => {
    const byDate = new Map<string, HistoryEntry>();
    history.forEach((h) => byDate.set(h.date, h));
    // Today is live, so it always comes from `daily` rather than the archive.
    byDate.set(today, {
      date: today,
      totalWorkMs: daily.sessions.reduce((a, s) => a + s.workMs, 0),
      totalBreakMs: daily.sessions.reduce((a, s) => a + s.breakMs, 0),
      unusedRestMs: 0,
      sessions: daily.sessions,
    });

    return Array.from({ length: DAYS }, (_, i) => {
      const date = shiftKey(DAYS - 1 - i);
      const entry = byDate.get(date);
      const sessions = entry?.sessions ?? [];
      const d = parseDate(date);
      return {
        date,
        activeMs: entry?.totalWorkMs ?? 0,
        restTakenMs: entry?.totalBreakMs ?? 0,
        restEarnedMs: restEarned(sessions),
        sessions,
        isToday: date === today,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      };
    });
  }, [history, daily, today]);

  const worked = days.filter((d) => d.activeMs > 0);
  const hasData = worked.length > 0;

  // The reference line: mean active time across the days that were actually
  // worked. Averaging in untouched days would drag it toward zero.
  const meanMs = hasData ? worked.reduce((a, d) => a + d.activeMs, 0) / worked.length : 0;
  const maxMs = Math.max(...days.map((d) => d.activeMs), meanMs * 1.25, 60 * 60_000);

  const selectedDay = days.find((d) => d.date === (selected ?? today)) ?? days[days.length - 1];
  const adherence =
    selectedDay.restEarnedMs > 0 ? selectedDay.restTakenMs / selectedDay.restEarnedMs : 0;

  const legend = [
    { color: 'var(--color-accent)', label: 'Active' },
    { color: 'var(--color-rest)', label: 'Rest taken' },
  ];

  // No outer card: the section header above it is the frame, and the content
  // lines up with every other section's left edge.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1" role="tablist" aria-label="Activity views">
          {([
            ['sessions', 'Sessions'],
            ['routines', 'Routines'],
            ['pace', 'Pace'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className="section-label px-2 py-1 rounded-lg transition-colors"
              style={
                tab === value
                  ? { background: 'var(--color-surface-2)', color: 'var(--color-text)' }
                  : { background: 'transparent' }
              }
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'sessions' ? (
          <div className="flex items-center gap-3">
            {legend.map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {label}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'pace' ? (
        <PaceChart />
      ) : tab === 'routines' ? (
        <RoutineAdherence />
      ) : !hasData ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
          Start a session and your days will appear here.
        </p>
      ) : (
        <>
          <p className="text-xs -mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Last <span className="num">{DAYS}</span> days
            {meanMs > 0 && (
              <>, averaging <span className="num font-semibold">{formatDuration(meanMs)}</span> a day</>
            )}
          </p>

          {/* ── Columns, with the mean drawn inside the plot ─────────────── */}
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {meanMs > 0 && (
              <div
                className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
                style={{
                  bottom: `${(meanMs / maxMs) * PLOT_HEIGHT}px`,
                  borderColor: 'var(--color-text-muted)',
                  opacity: 0.45,
                }}
                aria-hidden="true"
              />
            )}

            <div className="flex items-end gap-1 h-full">
              {days.map((d, i) => {
                const h = maxMs > 0 ? (d.activeMs / maxMs) * PLOT_HEIGHT : 0;
                const isSelected = d.date === selectedDay.date;
                const live = d.isToday && timerState !== 'idle';
                return (
                  <button
                    key={d.date}
                    onClick={() => setSelected(d.date)}
                    aria-label={`${fullDayLabel(d.date, d.isToday)}: ${formatDuration(d.activeMs)} active`}
                    aria-pressed={isSelected}
                    className="flex-1 h-full flex items-end min-w-0 rounded-t-sm"
                    style={{ background: isSelected ? 'var(--color-surface-2)' : 'transparent' }}
                  >
                    <motion.div
                      className="w-full rounded-t-sm"
                      initial={{ height: 0 }}
                      animate={{ height: Math.max(h, d.activeMs > 0 ? 2 : 0) }}
                      transition={{ duration: 0.4, delay: i * 0.02, ease: 'easeOut' }}
                      style={{
                        background: live ? 'transparent' : 'var(--color-accent)',
                        border: live ? '1.5px dashed var(--color-accent)' : 'none',
                        opacity: d.isWeekend && !isSelected ? 0.45 : isSelected ? 1 : 0.85,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Rest taken against rest earned, one strip per day ─────────── */}
          <div className="flex items-end gap-1">
            {days.map((d) => {
              const ratio = d.restEarnedMs > 0 ? d.restTakenMs / d.restEarnedMs : 0;
              const over = ratio > 1;
              return (
                <div key={d.date} className="flex-1 min-w-0" title={`${fullDayLabel(d.date, d.isToday)}: rest ${formatDuration(d.restTakenMs)} of ${formatDuration(d.restEarnedMs)} earned`}>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'var(--color-surface-2)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(ratio, 1) * 100}%`,
                        background: over ? 'var(--color-debt)' : 'var(--color-rest)',
                        opacity: d.isWeekend ? 0.5 : 0.85,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Day axis ─────────────────────────────────────────────────── */}
          <div className="flex gap-1 -mt-2">
            {days.map((d) => (
              <div
                key={d.date}
                className="flex-1 min-w-0 text-center text-[10px] truncate"
                style={{
                  color: d.date === selectedDay.date ? 'var(--color-text)' : 'var(--color-text-muted)',
                  fontWeight: d.date === selectedDay.date ? 600 : 400,
                }}
              >
                {d.isToday ? 'Now' : dayLabel(d.date)}
              </div>
            ))}
          </div>

          {/* ── The selected day in detail ───────────────────────────────── */}
          <div
            className="rounded-xl border p-3 flex flex-col gap-3"
            style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {fullDayLabel(selectedDay.date, selectedDay.isToday)}
              </span>
              {selectedDay.restEarnedMs > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Took{' '}
                  <span
                    className="num font-semibold"
                    style={{ color: adherence > 1 ? 'var(--color-debt)' : 'var(--color-rest)' }}
                  >
                    {Math.round(adherence * 100)}%
                  </span>{' '}
                  of the rest it earned
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Active', value: formatDuration(selectedDay.activeMs), color: 'var(--color-text)' },
                { label: 'Rest taken', value: formatDuration(selectedDay.restTakenMs), color: 'var(--color-rest)' },
                { label: 'Rest earned', value: formatDuration(selectedDay.restEarnedMs), color: 'var(--color-text-muted)' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {label}
                  </div>
                  <div className="num text-sm font-semibold" style={{ color }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {selectedDay.sessions.length > 0 ? (
              <DayShape sessions={selectedDay.sessions} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Nothing recorded on this day.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
