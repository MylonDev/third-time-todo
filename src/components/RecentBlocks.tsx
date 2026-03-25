import { useState, useId } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../store/session';
import { formatTimeLong, todayKey } from '../utils/thirdTime';
import type { HistoryEntry } from '../types';

const VISIBLE_DEFAULT = 5;

type DayEntry = HistoryEntry & { isToday: boolean; isLive: boolean };

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

function DayBar({
  entry,
  maxMs,
  index,
}: {
  entry: DayEntry;
  maxMs: number;
  index: number;
}) {
  const workPct = maxMs > 0 ? (entry.totalWorkMs / maxMs) * 100 : 0;
  const restPct = maxMs > 0 ? (entry.totalBreakMs / maxMs) * 100 : 0;
  const unusedPct = maxMs > 0 ? (entry.unusedRestMs / maxMs) * 100 : 0;
  const hasAny = entry.totalWorkMs > 0 || entry.totalBreakMs > 0;

  return (
    <motion.div
      className="flex items-center gap-3 py-2"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
    >
      {/* Date label */}
      <div className="w-20 flex-shrink-0 flex items-center gap-1.5">
        <span
          className="text-sm font-semibold"
          style={{
            fontFamily: 'var(--font-display)',
            color: entry.isToday ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          {dateLabel(entry.date)}
        </span>
        {entry.isLive && (
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          />
        )}
      </div>

      {/* Bar track */}
      <div
        className="flex-1 h-2.5 rounded-full overflow-hidden"
        style={{ background: 'var(--color-surface-2)' }}
      >
        {hasAny ? (
          <div className="flex h-full">
            {/* Active time — amber */}
            {workPct > 0 && (
              <div
                className="h-full flex-shrink-0 rounded-l-full"
                style={{
                  width: `${workPct}%`,
                  background: 'var(--color-accent)',
                  opacity: 0.85,
                }}
              />
            )}
            {/* Rest time — sage */}
            {restPct > 0 && (
              <div
                className="h-full flex-shrink-0"
                style={{
                  width: `${restPct}%`,
                  background: 'var(--color-rest)',
                  opacity: 0.7,
                }}
              />
            )}
            {/* Unused rest — dimmer amber */}
            {unusedPct > 0 && (
              <div
                className="h-full flex-shrink-0 rounded-r-full"
                style={{
                  width: `${unusedPct}%`,
                  background: 'var(--color-accent)',
                  opacity: 0.25,
                }}
              />
            )}
          </div>
        ) : (
          <div className="h-full w-full opacity-0" />
        )}
      </div>

      {/* Active time label */}
      <div className="w-14 text-right flex-shrink-0">
        {hasAny ? (
          <span
            className="font-timer text-sm"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {formatTimeLong(entry.totalWorkMs)}
          </span>
        ) : (
          <span className="text-xs" style={{ color: 'var(--color-border)' }}>—</span>
        )}
      </div>
    </motion.div>
  );
}

export function RecentBlocks() {
  const { daily, history, timerState } = useSession();
  const [showAll, setShowAll] = useState(false);
  const svgId = useId();

  const today = todayKey();

  // Build today's live entry
  const todayEntry: DayEntry = {
    date: today,
    totalWorkMs: daily.sessions.reduce((a, s) => a + s.workMs, 0),
    totalBreakMs: daily.sessions.reduce((a, s) => a + s.breakMs, 0),
    unusedRestMs: Math.max(0, daily.bankMs),
    sessions: daily.sessions,
    isToday: true,
    isLive: timerState !== 'idle',
  };

  // Merge with history (exclude duplicate today entry if already archived)
  const historyEntries: DayEntry[] = history
    .filter((h) => h.date !== today)
    .map((h) => ({ ...h, isToday: false, isLive: false }));

  const allEntries = [todayEntry, ...historyEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15);

  const visibleEntries = showAll ? allEntries : allEntries.slice(0, VISIBLE_DEFAULT);
  const hiddenCount = allEntries.length - VISIBLE_DEFAULT;

  // Max total ms for proportional bars
  const maxMs = Math.max(
    ...allEntries.map((e) => e.totalWorkMs + e.totalBreakMs + e.unusedRestMs),
    1
  );

  // Activity Path SVG — rolling 7-day average + band
  const last7 = allEntries.slice(0, 7);
  const avgWorkMs = last7.length > 0
    ? last7.reduce((a, e) => a + e.totalWorkMs, 0) / last7.length
    : 0;
  const bandHalfMs = avgWorkMs * 0.18;

  // SVG dimensions — computed from visible count
  const svgHeight = 40;
  const svgWidth = 100; // percentage-based via viewBox
  const bandTop = maxMs > 0 ? ((maxMs - (avgWorkMs + bandHalfMs)) / maxMs) * svgHeight : 0;
  const bandBottom = maxMs > 0 ? ((maxMs - Math.max(0, avgWorkMs - bandHalfMs)) / maxMs) * svgHeight : svgHeight;
  const bandHeight = Math.max(0, bandBottom - bandTop);

  // Compute path d for trendline
  const pathD = visibleEntries.length > 1
    ? visibleEntries
        .map((entry, i) => {
          const x = (i / (visibleEntries.length - 1)) * svgWidth;
          const y = maxMs > 0
            ? ((maxMs - entry.totalWorkMs) / maxMs) * svgHeight
            : svgHeight;
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  const hasData = allEntries.some((e) => e.totalWorkMs > 0);

  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-1"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[13px] font-semibold uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}
        >
          Recent Blocks
        </span>
        {/* Legend */}
        <div className="flex items-center gap-3">
          {[
            { color: 'var(--color-accent)', label: 'Active', opacity: 0.85 },
            { color: 'var(--color-rest)', label: 'Rest', opacity: 0.7 },
            { color: 'var(--color-accent)', label: 'Unused', opacity: 0.25 },
          ].map(({ color, label, opacity }) => (
            <span key={label} className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: color, opacity }}
              />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Activity Path SVG overlay */}
      {hasData && avgWorkMs > 0 && visibleEntries.length > 1 && (
        <div className="relative h-10 mb-1 pointer-events-none">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            <defs>
              <clipPath id={`${svgId}-clip`}>
                <rect x="0" y="0" width={svgWidth} height={svgHeight} />
              </clipPath>
            </defs>
            {/* Band */}
            <motion.rect
              x="0"
              y={bandTop}
              width={svgWidth}
              height={bandHeight}
              fill="var(--color-accent)"
              clipPath={`url(#${svgId}-clip)`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.06 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
            {/* Trendline */}
            {pathD && (
              <motion.path
                d={pathD}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                clipPath={`url(#${svgId}-clip)`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.45 }}
                transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.4 }}
              />
            )}
          </svg>
        </div>
      )}

      {/* Day bars */}
      <div className="flex flex-col divide-y" style={{ borderColor: 'transparent' }}>
        {visibleEntries.map((entry, i) => (
          <DayBar key={entry.date} entry={entry} maxMs={maxMs} index={i} />
        ))}
      </div>

      {/* Empty state */}
      {!hasData && (
        <p
          className="text-sm text-center py-4"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Start a session to see your activity here
        </p>
      )}

      {/* Expand / collapse */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-1 text-sm font-semibold text-center w-full transition-opacity opacity-50 hover:opacity-100"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {showAll ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
