import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { earnBreak, formatDuration, todayKey, shiftDayKey } from '../utils/thirdTime';
import { durationOf, workMsOf, breakMsOf } from '../utils/ledger';
import { PaceChart } from './PaceChart';
import { DayTimeline } from './DayTimeline';
import type { HistoryEntry, TimeEntry } from '../types';

const DAYS = 14;
const PLOT_HEIGHT = 116;

type Day = {
  date: string;
  activeMs: number;
  restTakenMs: number;
  restEarnedMs: number;
  entries: TimeEntry[];
  isToday: boolean;
  isWeekend: boolean;
};

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/** Rest the day's work actually earned — summed per block, since mode can change. */
function restEarned(entries: TimeEntry[]): number {
  return entries
    .filter((e) => e.kind === 'work')
    .reduce((total, e) => total + earnBreak(durationOf(e), e.mode), 0);
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

export function Activity() {
  const { daily, history, timerState } = useSession();
  const dayEndHour = useSettings((s) => s.dayEndHour);
  const today = todayKey(dayEndHour);
  const [selected, setSelected] = useState<string | null>(null);

  const days: Day[] = useMemo(() => {
    const byDate = new Map<string, HistoryEntry>();
    history.forEach((h) => byDate.set(h.date, h));
    // Today is live, so it always comes from `daily` rather than the archive.
    byDate.set(today, {
      date: today,
      totalWorkMs: workMsOf(daily.entries),
      totalBreakMs: breakMsOf(daily.entries),
      unusedRestMs: 0,
      entries: daily.entries,
    });

    return Array.from({ length: DAYS }, (_, i) => {
      // Counted back from today's day key, not the calendar date — between
      // midnight and a later `dayEndHour` they differ, and the calendar
      // version drew an empty bar for a "today" that hasn't started.
      const date = shiftDayKey(today, -(DAYS - 1 - i));
      const entry = byDate.get(date);
      const entries = entry?.entries ?? [];
      const d = parseDate(date);
      return {
        date,
        activeMs: entry?.totalWorkMs ?? 0,
        restTakenMs: entry?.totalBreakMs ?? 0,
        restEarnedMs: restEarned(entries),
        entries,
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

  // One combined scroll — pace, then the fortnight, then the selected day.
  // No outer card: the tab header is the frame.
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

      {/* Always drawn — an empty day is where a forgotten block gets added. */}
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

        {selectedDay.entries.length === 0 && !selectedDay.isToday && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Nothing recorded on this day.
          </p>
        )}
        <DayTimeline
          key={selectedDay.date}
          date={selectedDay.date}
          entries={selectedDay.entries}
          isToday={selectedDay.isToday}
        />
      </section>
    </div>
  );
}
