import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

/**
 * Seed `days` of archived history ending yesterday, `hoursFor(daysAgo)` of
 * work each, with every day worked at `mode`. Today gets `todayHours`.
 */
async function seedHistory(
  page: Page,
  days: number,
  hoursFor: (daysAgo: number) => number,
  opts: { mode?: string; todayHours?: number } = {}
) {
  await page.evaluate(
    ({ days, src, mode, todayHours }) => {
      const fn = new Function('i', `return (${src})(i)`) as (i: number) => number;
      const k = (d: Date) =>
        [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      const at9 = (daysAgo: number) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        d.setHours(9, 0, 0, 0);
        return d;
      };
      const history = [];
      for (let i = 1; i <= days; i++) {
        const d = at9(i);
        const ms = Math.round(fn(i) * 3_600_000);
        if (ms === 0) continue;
        history.push({
          date: k(d), totalWorkMs: ms, totalBreakMs: 0, unusedRestMs: 0, mode,
          entries: [{ id: 'h' + i, kind: 'work', startedAt: d.getTime(), endedAt: d.getTime() + ms, mode }],
        });
      }
      const today = at9(0);
      const todayMs = todayHours * 3_600_000;
      localStorage.setItem('tt-session', JSON.stringify({
        state: {
          daily: {
            date: k(today),
            entries: todayMs
              ? [{ id: 't', kind: 'work', startedAt: today.getTime(), endedAt: today.getTime() + todayMs, mode: 'third' }]
              : [],
          },
          history, timerState: 'idle', timerStart: null, sessionClosedAt: null,
        },
        version: 5,
      }));
    },
    { days, src: hoursFor.toString(), mode: opts.mode ?? 'third', todayHours: opts.todayHours ?? 0 }
  );
  await page.reload();
}

const pill = (page: Page, label: string) =>
  page.getByRole('group', { name: 'Today’s difficulty' }).getByRole('button', { name: new RegExp(label) });

test.describe('difficulty per day', () => {
  // Pinned to midday so the seeded 09:00 stint is always in the past.
  test.beforeEach(async ({ app }) => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    await app.clock.install({ time: noon });
    await app.reload();
  });

  test('once work has started, a second easing off is refused with the reason shown', async ({ app }) => {
    await seedHistory(app, 0, () => 0, { todayHours: 1 });
    await pill(app, 'Relaxed').click();
    await expect(pill(app, 'Relaxed')).toHaveAttribute('aria-pressed', 'true');

    await pill(app, 'Locked in').click(); // raising is never blocked
    await expect(pill(app, 'Locked in')).toHaveAttribute('aria-pressed', 'true');

    await expect(pill(app, 'Serious')).toBeDisabled();
    await expect(app.getByText('No reductions left today')).toBeVisible();
  });

  test('raising while above the band asks first, then proceeds', async ({ app }) => {
    // A normal month, then a heavy last week: well above the band.
    // Today starts at the default, Serious.
    await seedHistory(app, 40, (i) => (i < 7 ? 11 : 4));
    await pill(app, 'Locked in').click();
    await expect(app.getByRole('alertdialog')).toContainText('ramping fast');
    await expect(pill(app, 'Serious')).toHaveAttribute('aria-pressed', 'true');

    await app.getByRole('button', { name: 'Raise to Locked in' }).click();
    await expect(app.getByRole('alertdialog')).toHaveCount(0);
    await expect(pill(app, 'Locked in')).toHaveAttribute('aria-pressed', 'true');
  });

  test('suggests an easier mode than yesterday’s when above the band', async ({ app }) => {
    await seedHistory(app, 40, (i) => (i < 7 ? 11 : 4), { mode: 'third' });
    await expect(pill(app, 'Relaxed').getByLabel('Suggested for today')).toBeVisible();
  });

  test('the Options default is what a fresh day starts at', async ({ app }) => {
    await app.getByRole('button', { name: 'Options' }).click();
    await app.getByLabel('A new day starts at').selectOption('quarter');
    await app.keyboard.press('Escape');
    await expect(pill(app, 'Locked in')).toHaveAttribute('aria-pressed', 'true');
  });
});
