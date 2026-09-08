import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../store/session';
import { useHabits } from '../store/habits';
import { earnBreak, formatDuration, todayKey } from '../utils/thirdTime';
import { adherence, dotStates, type DotState } from '../utils/habit';
import { freqLabel } from '../utils/habitFreq';
import { lastNDays } from '../utils/goalPeriod';
import { PaceChart } from './PaceChart';
import type { Habit, HistoryEntry, SessionLog } from '../types';

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
  const longest = Math.max(...blocks.map((s) => s.workMs));

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
          <span className="num">{formatDuration(longest)}</span>
        </span>
        <span className="num">{clockLabel(end)}</span>
      </div>
    </div>
  );
}

function HabitRow({ habit }: { habit: Habit }) {
  const created = new Date(habit.createdAt);
  created.setHours(0, 0, 0, 0);

  // Days before the habit existed are not misses — blank them in the grid and
  // keep the percentage over the window the habit has actually been alive for.
  const states = dotStates(habit, DAYS);
  const alive = lastNDays(DAYS).map((key) => new Date(key + 'T00:00:00') >= created);
  const cells = alive.map((live, i) => (live ? states[i] : ('off' as DotState)));
  const aliveDays = alive.filter(Boolean).length;

  const { pct } = adherence(habit, Math.max(1, aliveDays));
  const low = pct < 0.5;

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-shrink-0 w-32">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
          {habit.name}
        </div>
        <div className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
          {freqLabel(habit.freq)}
        </div>
      </div>
      <div className="flex-1 flex items-center gap-1 min-w-0">
        {cells.map((state, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-[3px] flex-shrink-0"
            title={state === 'done' ? 'Done' : state === 'missed' ? 'Missed' : 'Not due'}
            style={{
              background: state === 'done' ? 'var(--color-habit)' : 'transparent',
              border:
                state === 'done'
                  ? 'none'
                  : `1px solid ${state === 'missed' ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
              opacity: state === 'off' ? 0.4 : 1,
            }}
          />
        ))}
      </div>
      <span
        className="num text-sm flex-shrink-0 w-10 text-right"
        style={{ color: low ? 'var(--color-text-muted)' : 'var(--color-text)' }}
      >
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

function HabitAdherence() {
  const habits = useHabits((s) => s.habits);
  const shown = useMemo(
    () =>
      habits
        .filter((h) => !h.archivedAt)
        .sort((a, b) => a.order - b.order)
        .slice(0, 6),
    [habits]
  );

  if (shown.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="section-label">Habits</span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          last <span className="num">{DAYS}</span> days
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {shown.map((h) => (
          <HabitRow key={h.id} habit={h} />
        ))}
      </div>
    </section>
  );
}

export function Activity() {
  const { daily, history, timerState } = useSession();
  const today = todayKey();
  const [selected, setSelected] = useState<string | null>(null);

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
  const restAdherence =
    selectedDay.restEarnedMs > 0 ? selectedDay.restTakenMs / selectedDay.restEarnedMs : 0;

  const legend = [
    { color: 'var(--color-accent)', label: 'Active' },
    { color: 'var(--color-rest)', label: 'Rest taken' },
  ];

  // One combined scroll — pace, then the fortnight, then the selected day, then
  // habit adherence. No outer card: the tab header is the frame.
  return (
    <div className="flex flex-col gap-8">
      <PaceChart />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="section-label">Last {DAYS} days</span>
            {meanMs > 0 && (
              <span className="text-[11px] num" style={{ color: 'var(--color-text-muted)' }}>
                avg {formatDuration(meanMs)} / day
              </span>
            )}
          </div>
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
        </div>

        {!hasData ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
            Start a session and your days will appear here.
          </p>
        ) : (
          <>
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
                  <div
                    key={d.date}
                    className="flex-1 min-w-0"
                    title={`${fullDayLabel(d.date, d.isToday)}: rest ${formatDuration(d.restTakenMs)} of ${formatDuration(d.restEarnedMs)} earned`}
                  >
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
                    color:
                      d.date === selectedDay.date
                        ? 'var(--color-text)'
                        : 'var(--color-text-muted)',
                    fontWeight: d.date === selectedDay.date ? 600 : 400,
                  }}
                >
                  {d.isToday ? 'Now' : dayLabel(d.date)}
                </div>
              ))}
            </div>

            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              bars = active time · thin track = share of earned rest actually taken
            </p>
          </>
        )}
      </section>

      {hasData && (
        <section
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
                  style={{ color: restAdherence > 1 ? 'var(--color-debt)' : 'var(--color-rest)' }}
                >
                  {Math.round(restAdherence * 100)}%
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
        </section>
      )}

      <HabitAdherence />
    </div>
  );
}
