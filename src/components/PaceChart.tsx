import { useMemo } from 'react';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { todayKey } from '../utils/thirdTime';
import {
  currentRunStart,
  denseLoads,
  pacePoints,
  verdict,
  BAND_HIGH,
  BAND_LOW,
  MIN_DAYS,
  type PacePoint,
} from '../utils/pace';

const PLOT_DAYS = 56; // eight weeks
const LOOKBACK = 28; // what chronic needs behind the first plotted point
const H = 184;
const W = 720;
const PAD_T = 12;
const PAD_B = 12;
const PAD_R = 10;

// The vertical axis is the acute:chronic ratio, not an absolute duration. A
// fixed range keeps the 0.8–1.3 band a readable slab and stops a single
// post-lapse spike from squashing everything flat. Values are clamped into it.
const R_LO = 0.5;
const R_HI = 1.6;

const hours = (ms: number) => ms / 3_600_000;

function edgeLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000);
}

const VERDICT_COPY = {
  above: {
    text: 'Above your usual pace',
    detail: 'This week is heavier than the last four. Sustainable for a stretch, not indefinitely.',
    color: 'var(--color-mode-quarter)',
  },
  within: {
    text: 'Holding a steady pace',
    detail: 'This week looks like your recent normal.',
    color: 'var(--color-rest)',
  },
  below: {
    text: 'Below your usual pace',
    detail: 'Lighter than the last four weeks — which is what recovery looks like, if that was the intent.',
    color: 'var(--color-accent)',
  },
  unknown: { text: '', detail: '', color: 'var(--color-text-muted)' },
} as const;

const yFor = (ratio: number) => {
  const clamped = Math.max(R_LO, Math.min(R_HI, ratio));
  return PAD_T + (1 - (clamped - R_LO) / (R_HI - R_LO)) * (H - PAD_T - PAD_B);
};

export function PaceChart() {
  const { history, daily } = useSession();
  const dayEndHour = useSettings((s) => s.dayEndHour);

  const { points, ready, daysShort, resuming } = useMemo(() => {
    const today = todayKey(dayEndHour);

    const byDate = new Map<string, number>();
    history.forEach((h) => byDate.set(h.date, h.totalWorkMs));
    // Today is live, so it comes from `daily` rather than the archive.
    byDate.set(today, daily.sessions.reduce((a, s) => a + s.workMs, 0));

    const dates = [...byDate.keys()].sort();
    if (dates.length === 0)
      return { points: [], ready: false, daysShort: MIN_DAYS, resuming: false };

    // Start from the current run of use, not the first record ever. A long gap
    // leaves a baseline that no longer describes you.
    const first = currentRunStart(dates) as string;
    const resuming = first !== dates[0];
    const span = daysBetween(first, today) + 1;
    if (span < MIN_DAYS) {
      return { points: [], ready: false, daysShort: MIN_DAYS - span, resuming };
    }

    const window = Math.min(span, PLOT_DAYS + LOOKBACK);
    const series = pacePoints(denseLoads(byDate, today, window));

    // The first six points have a partial 7-day window, so they understate.
    return {
      points: series.slice(6).slice(-PLOT_DAYS),
      ready: true,
      daysShort: 0,
      resuming,
    };
  }, [history, daily, dayEndHour]);

  if (!ready) {
    return (
      <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
        {resuming ? 'Picking up after a break' : 'Building your baseline'} — about{' '}
        <span className="num">{daysShort}</span> more {daysShort === 1 ? 'day' : 'days'} of
        use and your pace band appears here.
      </p>
    );
  }

  const latest = points[points.length - 1] as PacePoint;
  const state = verdict(latest);
  const copy = VERDICT_COPY[state];

  // Only the points that have something to compare against get a ratio; a null
  // ratio in the path would render NaN and trip the console-error guard.
  const rated = points
    .map((p, i) => ({ p, i, ratio: p.ratio }))
    .filter((d): d is { p: PacePoint; i: number; ratio: number } => d.ratio !== null);

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * (W - PAD_R);

  const line = rated
    .map((d, k) => `${k === 0 ? 'M' : 'L'}${x(d.i)},${yFor(d.ratio)}`)
    .join(' ');
  const area =
    rated.length > 1
      ? `${line} L${x(rated[rated.length - 1].i)},${yFor(R_LO)} L${x(rated[0].i)},${yFor(R_LO)} Z`
      : '';

  const last = rated[rated.length - 1];
  const bandTop = yFor(BAND_HIGH);
  const bandBottom = yFor(BAND_LOW);

  // Axis labels live in HTML: the viewBox is stretched to the container width
  // (preserveAspectRatio="none") and would distort any <text> inside it.
  const axisMarks = [
    { ratio: BAND_HIGH, label: `${BAND_HIGH}×` },
    { ratio: 1, label: '1.0×' },
    { ratio: BAND_LOW, label: `${BAND_LOW}×` },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
        <span className="text-[13px] font-semibold" style={{ color: copy.color }}>
          {copy.text}
        </span>
        {latest.ratio !== null && (
          <span className="num text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {latest.ratio.toFixed(2)}×
          </span>
        )}
        <span className="text-xs sm:ml-auto min-w-0" style={{ color: 'var(--color-text-muted)' }}>
          <span className="num">{hours(latest.acuteMs).toFixed(1)}h</span> this week ·{' '}
          <span className="num">{hours(latest.chronicMs).toFixed(1)}h</span> usual
        </span>
      </div>

      <div className="relative pl-7" style={{ height: H }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: H }}
          role="img"
          aria-label={`${copy.text}. ${hours(latest.acuteMs).toFixed(1)} hours active over the last seven days, against a usual week of ${hours(latest.chronicMs).toFixed(1)} hours — a ratio of ${latest.ratio?.toFixed(2) ?? 'not enough history'}.`}
        >
          {/* The sustainable band, a fixed slab because the axis is the ratio. */}
          <rect
            x={0}
            y={bandTop}
            width={W}
            height={bandBottom - bandTop}
            fill="var(--color-pace-band)"
            stroke="none"
          />
          {axisMarks.map((m) => (
            <line
              key={m.label}
              x1={0}
              x2={W}
              y1={yFor(m.ratio)}
              y2={yFor(m.ratio)}
              stroke={m.ratio === 1 ? 'var(--color-text-muted)' : 'var(--color-rest-edge)'}
              strokeWidth={1}
              strokeDasharray={m.ratio === 1 ? '2 5' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {area && <path d={area} fill="var(--color-accent-dim)" stroke="none" />}
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {last && (
            <>
              <circle cx={x(last.i)} cy={yFor(last.ratio)} r={7} fill={copy.color} opacity={0.22} />
              <circle
                data-testid="pace-marker"
                cx={x(last.i)}
                cy={yFor(last.ratio)}
                r={3.5}
                fill={copy.color}
              />
            </>
          )}
        </svg>

        {axisMarks.map((m) => (
          <span
            key={m.label}
            className="num absolute left-0 text-[10px] -translate-y-1/2 pointer-events-none"
            style={{
              top: yFor(m.ratio),
              color: 'var(--color-text-muted)',
            }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <div className="flex items-baseline justify-between -mt-2 pl-7">
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {edgeLabel(points[0].date)}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Today
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs min-w-0" style={{ color: 'var(--color-text-muted)' }}>
          {copy.detail}
        </span>
        <span className="text-xs num flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {BAND_LOW}–{BAND_HIGH}× band
        </span>
      </div>
    </div>
  );
}
