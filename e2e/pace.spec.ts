import { test as base, expect } from '@playwright/test';
import { test, expect as e } from './helpers';
import { denseLoads, pacePoints, verdict, BAND_HIGH, BAND_LOW } from '../src/utils/pace';

const H = 3_600_000;

function key(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

/** A dense series ending today, newest-last, from a per-day-ago hour function. */
function series(days: number, hoursFor: (daysAgo: number, date: Date) => number) {
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    map.set(key(i), hoursFor(i, d) * H);
  }
  return denseLoads(map, key(0), days);
}

const last = <T,>(a: T[]) => a[a.length - 1];

// ── the maths, with no browser involved ─────────────────────────────────────
base.describe('pace maths', () => {
  base('a steady load sits at a ratio of about 1', () => {
    const points = pacePoints(series(60, () => 5));
    expect(last(points).ratio!).toBeGreaterThan(0.95);
    expect(last(points).ratio!).toBeLessThan(1.05);
    expect(verdict(last(points))).toBe('within');
  });

  base('ramping the last week pushes above the band', () => {
    const points = pacePoints(series(60, (i) => (i < 7 ? 10 : 5)));
    expect(last(points).ratio!).toBeGreaterThan(BAND_HIGH);
    expect(verdict(last(points))).toBe('above');
  });

  base('tapering the last week drops below it', () => {
    const points = pacePoints(series(60, (i) => (i < 7 ? 1 : 5)));
    expect(last(points).ratio!).toBeLessThan(BAND_LOW);
    expect(verdict(last(points))).toBe('below');
  });

  base('no history to compare against gives no ratio', () => {
    const points = pacePoints(series(30, () => 0));
    expect(last(points).ratio).toBeNull();
    expect(verdict(last(points))).toBe('unknown');
  });

  /**
   * The reason the unit is a rolling week rather than a day. Weekdays log
   * general work and weekends log only specific goals, so daily values are
   * bimodal — but every 7-day window holds the same mix, so the ratio should
   * barely move from one day to the next.
   */
  base('a heavy-weekday, light-weekend pattern stays inside the band', () => {
    const points = pacePoints(
      series(70, (_i, d) => (d.getDay() === 0 || d.getDay() === 6 ? 1 : 5))
    );
    // Skip the warm-up days, where the windows are still filling.
    const settled = points.slice(35);
    for (const p of settled) {
      expect(verdict(p), `${p.date} read as ${verdict(p)} at ${p.ratio?.toFixed(2)}`).toBe('within');
    }
  });

  base('chronic averages over the days there are, not a fixed 28', () => {
    // Ten days of steady load and nothing before it. Chronic must be the mean
    // of those ten, not a 28-day mean with eighteen zeros dragging it down.
    const points = pacePoints(series(10, () => 5));
    expect(last(points).chronicMs).toBeCloseTo(5 * H * 7, -6);
    expect(last(points).ratio!).toBeCloseTo(1, 1);
  });
});

// ── and the rendered chart ──────────────────────────────────────────────────
async function seed(page: import('@playwright/test').Page, days: number, hoursFor: (i: number, weekend: boolean) => number) {
  await page.evaluate(
    ({ days, src }) => {
      const fn = new Function('i', 'weekend', `return (${src})(i, weekend)`) as (i: number, w: boolean) => number;
      const k = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      const history = [];
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        const workMs = Math.round(fn(i, weekend) * 3600000);
        history.push({ date: k(d), totalWorkMs: workMs, totalBreakMs: 0, unusedRestMs: 0, sessions: [] });
      }
      const todayMs = history[0].totalWorkMs;
      localStorage.setItem('tt-session', JSON.stringify({
        state: {
          daily: {
            date: k(new Date()),
            bankMs: 0,
            // The chart reads today from `daily`, so it has to live here or
            // today reads as a zero day and flattens the ratio.
            sessions: [{ id: 'seed', workMs: todayMs, breakMs: 0, mode: 'third', startedAt: Date.now() }],
          },
          history, timerState: 'idle', timerStart: null, sessionClosedAt: null, focusedItem: null,
        },
        version: 3,
      }));
    },
    { days, src: hoursFor.toString() }
  );
  await page.reload();
}

const paceTab = async (page: import('@playwright/test').Page) => {
  const activity = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Activity', exact: true }),
  });
  await activity.getByRole('tab', { name: 'Pace' }).click();
  return activity;
};

test.describe('the pace chart', () => {
  test('says so while there is not enough history', async ({ app }) => {
    const activity = await paceTab(app);
    await e(activity).toContainText('Building your baseline');
  });

  test('reads a steady history as steady', async ({ app }) => {
    await seed(app, 60, () => 5);
    const activity = await paceTab(app);
    await e(activity).toContainText('Holding a steady pace');
  });

  test('reads a ramp as above pace', async ({ app }) => {
    await seed(app, 60, (i) => (i < 7 ? 11 : 5));
    const activity = await paceTab(app);
    await e(activity).toContainText('Above your usual pace');
  });

  test('reads a taper as below pace', async ({ app }) => {
    await seed(app, 60, (i) => (i < 7 ? 1 : 5));
    const activity = await paceTab(app);
    await e(activity).toContainText('Below your usual pace');
  });

  /**
   * Days before the first record are absent, not idle. Padding them with zeros
   * drags chronic down and reports a steady three weeks as a spike.
   */
  test('a short history is not padded with zeros', async ({ app }) => {
    // Deliberately just over the minimum. The shorter the history, the bigger
    // the gap between averaging over the days there are and averaging over a
    // fixed 28 — at 21 days both readings still land inside the band, so the
    // test would pass against the bug.
    await seed(app, 15, () => 5);
    const activity = await paceTab(app);
    await e(activity).toContainText('Holding a steady pace');
  });

  test("today's marker is painted in the same verdict as the headline", async ({ app }) => {
    const markerFill = async () =>
      app.locator('svg circle').last().getAttribute('fill');

    await seed(app, 60, (i) => (i < 7 ? 11 : 5));
    let activity = await paceTab(app);
    await e(activity).toContainText('Above your usual pace');
    e(await markerFill(), 'marker did not follow the verdict').toBe('var(--color-mode-quarter)');

    await seed(app, 60, () => 5);
    activity = await paceTab(app);
    await e(activity).toContainText('Holding a steady pace');
    e(await markerFill()).toBe('var(--color-rest)');
  });

  test('a heavy-weekday, light-weekend history reads as steady', async ({ app }) => {
    await seed(app, 70, (_i, weekend) => (weekend ? 1 : 5));
    const activity = await paceTab(app);
    await e(activity).toContainText('Holding a steady pace');
  });
});
