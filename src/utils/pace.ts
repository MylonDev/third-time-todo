/**
 * Is this week's pace one you could keep up?
 *
 * Borrowed from the acute:chronic workload ratio used in sports science:
 * compare the last 7 days of load against the average week of the last 28.
 * A ratio near 1 means this week looks like your recent normal; well above
 * means you are ramping faster than you have adapted to.
 *
 * Two decisions worth knowing about:
 *
 * - **The unit is a rolling 7-day total, not a day.** Daily figures here are
 *   bimodal — weekdays log general work, weekends log only specific goals —
 *   so a band around a daily value would be wrong on five days out of seven.
 *   Every 7-day window contains the same mix of weekdays and weekend days, so
 *   banding the window makes the problem disappear rather than modelling it.
 *
 * - **The band is relative to you.** There is no absolute floor. "Below the
 *   band" means below your own recent normal, which does mean the band drifts
 *   down if you coast for a month.
 */

const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

/**
 * The canonical "sweet spot". Treat these as tunable, not as fact: the 0.8–1.3
 * figure comes from injury-risk work that has been fairly criticised for
 * bucketing continuous data into artificial thresholds, and a randomised trial
 * found no benefit. They are here because the shape is useful, not because the
 * numbers are settled.
 */
export const BAND_LOW = 0.8;
export const BAND_HIGH = 1.3;

/** Below this many days of history the band is too noisy to draw at all. */
export const MIN_DAYS = 14;

export interface DayLoad {
  date: string; // YYYY-MM-DD
  workMs: number;
}

export interface PacePoint {
  date: string;
  /** Total load over this day and the six before it. */
  acuteMs: number;
  /** The average week across the last 28 days, in the same units as acute. */
  chronicMs: number;
  lowerMs: number;
  upperMs: number;
  /** acute / chronic, or null before there is anything to compare against. */
  ratio: number | null;
}

function sumWindow(loads: DayLoad[], endIndex: number, days: number): number {
  let total = 0;
  for (let i = Math.max(0, endIndex - days + 1); i <= endIndex; i++) {
    total += loads[i].workMs;
  }
  return total;
}

/**
 * `loads` must be dense and ascending — one entry per day with no gaps, zero
 * for days with no activity. A day off is real data, not a missing value.
 *
 * Returns a point per input day. Callers usually plot only the tail; the
 * leading days exist so the earliest plotted point has its 28-day lookback.
 */
export function pacePoints(loads: DayLoad[]): PacePoint[] {
  return loads.map((load, i) => {
    const acuteMs = sumWindow(loads, i, ACUTE_DAYS);

    // Average over however much history there is, up to 28 days, expressed as
    // a week so it is directly comparable with acute.
    const chronicDaysAvailable = Math.min(i + 1, CHRONIC_DAYS);
    const chronicMs =
      (sumWindow(loads, i, CHRONIC_DAYS) / chronicDaysAvailable) * ACUTE_DAYS;

    return {
      date: load.date,
      acuteMs,
      chronicMs,
      lowerMs: chronicMs * BAND_LOW,
      upperMs: chronicMs * BAND_HIGH,
      ratio: chronicMs > 0 ? acuteMs / chronicMs : null,
    };
  });
}

export type PaceVerdict = 'above' | 'within' | 'below' | 'unknown';

export function verdict(point: PacePoint): PaceVerdict {
  if (point.ratio === null) return 'unknown';
  if (point.ratio > BAND_HIGH) return 'above';
  if (point.ratio < BAND_LOW) return 'below';
  return 'within';
}

/** A dense, ascending series ending today, zero-filled for days with no record. */
export function denseLoads(
  workMsByDate: Map<string, number>,
  endDate: string,
  days: number
): DayLoad[] {
  const end = new Date(endDate + 'T00:00:00');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(end);
    d.setDate(d.getDate() - (days - 1 - i));
    const date = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
    return { date, workMs: workMsByDate.get(date) ?? 0 };
  });
}
