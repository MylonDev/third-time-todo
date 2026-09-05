import { useMemo } from 'react';
import { useSession } from '../store/session';
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
const H = 208;
const W = 720;
const PAD_T = 14;
const PAD_B = 18;
// Room for today's marker, which would otherwise be halved by the right edge.
const PAD_R = 10;

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

export function PaceChart() {
  const { history, daily } = useSession();

  const { points, ready, daysShort, resuming } = useMemo(() => {
    const today = todayKey();

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

    // Start the series at the first record, never before it. Days that
    // pre-date any history are absent, not idle: padding them with zeros drags
    // the chronic average down and draws a band that collapses toward nothing
    // on the left.
    const window = Math.min(span, PLOT_DAYS + LOOKBACK);
    const series = pacePoints(denseLoads(byDate, today, window));

    // The first six points have a partial 7-day window, so they understate.
    // Chronic is an average and stays honest over a short history.
    return {
      points: series.slice(6).slice(-PLOT_DAYS),
      ready: true,
      daysShort: 0,
      resuming,
    };
  }, [history, daily]);

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

  // Scaled to the data, not to zero. The question this chart answers is where
  // you sit against your own band; anchoring at zero spends more than half the
  // frame on empty space below it. The axis label states the real range.
  const lo = Math.min(...points.map((p) => Math.min(p.acuteMs, p.lowerMs)));
  const hi = Math.max(...points.map((p) => Math.max(p.acuteMs, p.upperMs)));
  const pad = (hi - lo) * 0.12 || hi * 0.1 || 1;
  const bottom = Math.max(0, lo - pad);
  const top = hi + pad;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * (W - PAD_R);
  const y = (ms: number) =>
    PAD_T + (1 - (ms - bottom) / (top - bottom)) * (H - PAD_T - PAD_B);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.acuteMs)}`).join(' ');
  const edge = (pick: (p: PacePoint) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(pick(p))}`).join(' ');

  const upperEdge = edge((p) => p.upperMs);
  const lowerEdge = edge((p) => p.lowerMs);
  // Along the top on the upper bound, back along the bottom on the lower one.
  const band = [
    upperEdge,
    ...points
      .slice()
      .reverse()
      .map((p, i) => `L${x(points.length - 1 - i)},${y(p.lowerMs)}`),
    'Z',
  ].join(' ');

  const gridLines = [bottom, (bottom + top) / 2, top];

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

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: H }}
        role="img"
        aria-label={`${copy.text}. ${hours(latest.acuteMs).toFixed(1)} hours active over the last seven days, against a usual week of ${hours(latest.chronicMs).toFixed(1)} hours.`}
      >
        {gridLines.map((ms) => (
          <line
            key={ms}
            x1={0}
            x2={W}
            y1={y(ms)}
            y2={y(ms)}
            stroke="var(--color-border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={band} fill="var(--color-pace-band)" stroke="none" />
        {[upperEdge, lowerEdge].map((d) => (
          <path
            key={d.slice(0, 24)}
            d={d}
            fill="none"
            stroke="var(--color-rest-edge)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={edge((p) => p.chronicMs)}
          fill="none"
          stroke="var(--color-rest-edge)"
          strokeWidth={1}
          strokeDasharray="2 5"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={x(points.length - 1)}
          cy={y(latest.acuteMs)}
          r={7}
          fill={copy.color}
          opacity={0.22}
        />
        <circle cx={x(points.length - 1)} cy={y(latest.acuteMs)} r={3.5} fill={copy.color} />
      </svg>

      {/* Axis labels live in HTML, not the SVG: the viewBox is stretched to
          the container width and would distort any text inside it. */}
      <div className="flex items-baseline justify-between -mt-2">
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {edgeLabel(points[0].date)}
        </span>
        <span className="text-[11px] num" style={{ color: 'var(--color-text-muted)' }}>
          {hours(bottom).toFixed(0)}–{hours(top).toFixed(0)}h per week
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
