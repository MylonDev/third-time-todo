import type { Page } from '@playwright/test';
import { advance, expect, MIN, startState, test } from './helpers';

async function startTimed(page: Page, length: string | number) {
  await page.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
  if (typeof length === 'number') await page.getByRole('spinbutton', { name: 'Custom minutes' }).fill(String(length));
  else await page.getByRole('button', { name: length, exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText('Timed running')).toBeVisible();
}

test.describe('timed sessions', () => {
  test('counts down, ends itself at 0:00, and leaves the Rest balance alone', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 6 * MIN); // earns 2:00
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(app.getByTestId('balance')).toHaveText('2:00');

    await startTimed(app, '10 min');
    await expect(app.getByTestId('elapsed')).toHaveText('10:00');
    await expect(app.getByTestId('planned')).toHaveText('of 10m');

    await advance(app, 4 * MIN);
    await expect(app.getByTestId('elapsed')).toHaveText('6:00');
    await expect(app.getByTestId('balance')).toHaveText('2:00');

    await advance(app, 6 * MIN);
    await expect(app.getByTestId('elapsed')).toHaveText('0:00');
    await expect(app.getByText('Stopped')).toBeVisible();
    await expect(app.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(app.getByTestId('totals')).toContainText('Timed 10m');
    await expect(app.getByTestId('totals')).toContainText('Focus 6m');
    await expect(app.getByTestId('balance')).toHaveText('2:00');
    await expect(app.getByText('Rest available')).toBeVisible();

    // Waiting longer adds nothing, and nothing switches to another state.
    await advance(app, 30 * MIN);
    await expect(app.getByTestId('totals')).toContainText('Timed 10m');
    await expect(app.getByText('Stopped')).toBeVisible();
  });

  test('Stop ends it early and keeps the time spent', async ({ app }) => {
    await startTimed(app, '30 min');
    await advance(app, 7 * MIN);
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(app.getByText('Stopped')).toBeVisible();
    await expect(app.getByTestId('totals')).toContainText('Timed 7m');
    await advance(app, 60 * MIN);
    await expect(app.getByTestId('totals')).toContainText('Timed 7m');
  });

  test('takes a custom number of minutes', async ({ app }) => {
    await app.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
    const start = app.getByRole('button', { name: 'Start', exact: true });
    const minutes = app.getByRole('spinbutton', { name: 'Custom minutes' });

    await minutes.fill('0');
    await expect(start).toBeDisabled();
    await minutes.fill('');
    await expect(start).toBeDisabled();
    await minutes.fill('7');
    await expect(start).toBeEnabled();
    await start.click();
    await expect(app.getByTestId('elapsed')).toHaveText('7:00');
    await expect(app.getByTestId('planned')).toHaveText('of 7m');
  });

  test('closes at its real end when the app comes back after it', async ({ app }) => {
    await startTimed(app, '10 min');
    await advance(app, 4 * MIN);
    await app.reload();
    await expect(app.getByText('Timed running')).toBeVisible();

    // Back after 40 minutes: it ended at 10, not now.
    await advance(app, 40 * MIN);
    await expect(app.getByText('Stopped')).toBeVisible();
    await expect(app.getByTestId('totals')).toContainText('Timed 10m');

    // The stored entry ends at start + 10 minutes, not when the app came back.
    const stored = await app.evaluate(() => JSON.parse(localStorage.getItem('tt2-ledger') ?? '{}').state.entries);
    expect(stored).toHaveLength(1);
    expect(stored[0].endedAt - stored[0].startedAt).toBe(10 * MIN);
  });

  test('has no Fix timer while it runs, and Flow tiles are out of the way', async ({ app }) => {
    await startTimed(app, '10 min');
    await expect(app.getByRole('button', { name: 'Fix timer' })).toHaveCount(0);
    await expect(app.getByRole('group', { name: 'Timer state' })).toHaveCount(0);
    await expect(app.getByRole('group', { name: 'Timer mode' })).toHaveCount(0);
  });

  test('back to back sessions are both counted', async ({ app }) => {
    await startTimed(app, '10 min');
    await advance(app, 10 * MIN);
    await expect(app.getByText('Stopped')).toBeVisible();
    await startTimed(app, '15 min');
    await advance(app, 15 * MIN);
    await expect(app.getByTestId('totals')).toContainText('Timed 25m');
  });
});
