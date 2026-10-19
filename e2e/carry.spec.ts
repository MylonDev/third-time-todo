import type { Page } from '@playwright/test';
import { advance, expect, MIN, startState, test } from './helpers';

const HOUR = 60 * MIN;

/** The fake clock starts at 10:00, so this lands at 00:30 the next day. */
const TO_HALF_PAST_MIDNIGHT = 14.5 * HOUR;

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Stop the timer' });

test.describe('carrying the balance past the day end', () => {
  test('rest left at the day end is kept, and Stop asks before clearing it', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 12 * HOUR); // 22:00, earned 4h
    await startState(app, 'Rest');
    await advance(app, HOUR); // 23:00, 3h left
    await expect(app.getByTestId('balance')).toHaveText('3:00:00');

    // Past midnight, with Rest running: 1h30m left, not the debt today's Rest alone would show.
    await advance(app, 1.5 * HOUR);
    await expect(app.getByText('Rest running')).toBeVisible();
    await expect(app.getByText('Rest available')).toBeVisible();
    await expect(app.getByTestId('balance')).toHaveText('1:30:00');
    // Today's totals still start at midnight.
    await expect(app.getByTestId('totals')).toContainText('Rest 30m');

    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(dialog(app)).toBeVisible();
    await expect(dialog(app).getByTestId('stop-clears')).toHaveText('Stopping clears 1h 30m of rest.');

    // Keep going leaves the timer running and the balance counting.
    await dialog(app).getByRole('button', { name: 'Keep going' }).click();
    await expect(dialog(app)).toHaveCount(0);
    await expect(app.getByText('Rest running')).toBeVisible();
    await advance(app, 10 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('1:20:00');

    await app.getByRole('button', { name: 'Stop' }).click();
    await dialog(app).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(dialog(app)).toHaveCount(0);
    await expect(app.getByText('Stopped')).toBeVisible();
    await expect(app.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  });

  test('Escape on the prompt keeps going', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, TO_HALF_PAST_MIDNIGHT);
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(dialog(app).getByTestId('stop-clears')).toHaveText('Stopping clears 4h 50m of rest.');
    await app.keyboard.press('Escape');
    await expect(dialog(app)).toHaveCount(0);
    await expect(app.getByText('Focus running')).toBeVisible();
  });

  test('debt is carried too, and Stop does not ask about it', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 30 * MIN); // earns 10m
    await startState(app, 'Rest');
    await advance(app, 13 * HOUR); // 23:30
    await expect(app.getByText('Rest debt')).toBeVisible();
    await expect(app.getByTestId('balance')).toHaveText('12:50:00');

    await advance(app, HOUR); // 00:30: debt carried, not reset to today's 30 minutes
    await expect(app.getByText('Rest debt')).toBeVisible();
    await expect(app.getByTestId('balance')).toHaveText('13:50:00');

    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(dialog(app)).toHaveCount(0);
    await expect(app.getByText('Stopped')).toBeVisible();
  });

  test('a Stop before the day end is not asked about, and the balance resets at the day end', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 3 * HOUR); // earns 1h
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(dialog(app)).toHaveCount(0);
    await expect(app.getByTestId('balance')).toHaveText('1:00:00');

    // Stopped over midnight: the day starts again at zero.
    await advance(app, 12 * HOUR);
    await expect(app.getByText('Stopped')).toBeVisible();
    await expect(app.getByTestId('balance')).toHaveText('0:00');
  });

  test('a stretch that began today is not asked about', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 2 * HOUR);
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(dialog(app)).toHaveCount(0);
    await expect(app.getByText('Stopped')).toBeVisible();
  });

  test('a Stop and a fresh start after the day end begin a new stretch', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, TO_HALF_PAST_MIDNIGHT);
    await app.getByRole('button', { name: 'Stop' }).click();
    await dialog(app).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(app.getByText('Stopped')).toBeVisible();

    // The clock is paused, so without a moment's gap the same state would simply carry on.
    await advance(app, 5_000);
    await startState(app, 'Focus');
    await advance(app, 30 * MIN);
    // Only the new stretch counts toward the new balance from here; stopping it asks nothing.
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(dialog(app)).toHaveCount(0);
  });
});
