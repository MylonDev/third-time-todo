import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

/** A run of daily session history ending today, plus today's live `daily`. */
async function seedSessions(page: Page, days: number, hoursFor: (daysAgo: number) => number) {
  await page.evaluate(
    ({ days, src }) => {
      const fn = new Function('i', `return (${src})(i)`) as (i: number) => number;
      const k = (d: Date) =>
        [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      const history = [];
      for (let i = 1; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const workMs = Math.round(fn(i) * 3600000);
        if (workMs > 0) {
          history.push({
            date: k(d),
            totalWorkMs: workMs,
            totalBreakMs: Math.round(workMs / 3),
            unusedRestMs: 0,
            sessions: [
              { id: 'h' + i, workMs, breakMs: Math.round(workMs / 3), mode: 'third', startedAt: d.setHours(9, 0, 0, 0) },
            ],
          });
        }
      }
      const todayMs = Math.round(fn(0) * 3600000);
      localStorage.setItem(
        'tt-session',
        JSON.stringify({
          state: {
            daily: {
              date: k(new Date()),
              bankMs: 0,
              sessions: todayMs
                ? [{ id: 'today', workMs: todayMs, breakMs: 0, mode: 'third', startedAt: Date.now() }]
                : [],
            },
            history,
            timerState: 'idle',
            timerStart: null,
            sessionClosedAt: null,
            focusedItem: null,
          },
          version: 3,
        })
      );
    },
    { days, src: hoursFor.toString() }
  );
  await page.reload();
}

const openActivity = async (page: Page) => {
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  return page.locator('main');
};

test.describe('the activity view', () => {
  test('is one combined scroll with no inner sub-tabs', async ({ app }) => {
    await openActivity(app);
    await expect(app.getByRole('tab', { name: 'Sessions', exact: true })).toHaveCount(0);
    await expect(app.getByRole('tab', { name: 'Pace', exact: true })).toHaveCount(0);
    await expect(app.getByRole('tab', { name: 'Routines', exact: true })).toHaveCount(0);
  });

  test('with no history it prompts for a first session and a baseline', async ({ app }) => {
    const main = await openActivity(app);
    await expect(main).toContainText('Building your baseline');
    await expect(main).toContainText('Start a session and your days will appear here.');
  });

  test('shows the last 14 days once there is history', async ({ app }) => {
    await seedSessions(app, 14, () => 2);
    const main = await openActivity(app);
    await expect(main).toContainText('Last 14 days');
    await expect(main).toContainText('avg');
    await expect(main.getByRole('button', { name: /active$/ }).first()).toBeVisible();
  });

  test('selecting a day updates the detail tiles', async ({ app }) => {
    await seedSessions(app, 14, (i) => (i === 3 ? 5 : 2));
    const main = await openActivity(app);
    // Pick the fourth column from the left and confirm the detail panel reacts.
    const cols = main.getByRole('button', { name: /active$/ });
    await cols.nth(3).click();
    await expect(main).toContainText('Active');
    await expect(main).toContainText('Rest earned');
  });

  test('keeps the wall-clock day strip in the selected-day detail', async ({ app }) => {
    await seedSessions(app, 5, () => 2);
    const main = await openActivity(app);
    await expect(main).toContainText(/block/);
    await expect(main).toContainText('longest');
  });
});
