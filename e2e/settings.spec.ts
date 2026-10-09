import { advance, expect, MIN, startState, test } from './helpers';

test.describe('settings', () => {
  test('a daily target shows progress and says when you can stop', async ({ app }) => {
    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByLabel('Daily Should target (hours)').fill('1');
    await app.getByRole('button', { name: 'Done' }).click();

    await startState(app, 'Should');
    await advance(app, 30 * MIN);
    await expect(app.getByTestId('target')).toHaveText('Target: 30m of 1h');
    await expect(app.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    await advance(app, 30 * MIN);
    await expect(app.getByTestId('target')).toHaveText('Target reached. You can stop for the day.');

    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(app.getByTestId('target')).toHaveText('Target reached. Enjoy the rest of the day.');
  });

  test('no target, no progress bar', async ({ app }) => {
    await expect(app.getByRole('progressbar')).toHaveCount(0);
  });

  test('a later day end keeps the small hours in the same day', async ({ app }) => {
    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByLabel('Day ends at').selectOption('3');
    await app.getByRole('button', { name: 'Done' }).click();

    await startState(app, 'Should');
    await advance(app, 30 * MIN);
    // 10:00 + 14h30m = 00:30. With a 3 AM day end this is still the same day.
    await app.clock.fastForward('14:00:00');
    await expect(app.getByTestId('totals')).toContainText('Should 14h 30m');
  });

  test('theme can be forced light and survives a reload', async ({ app }) => {
    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click();
    await expect(app.locator('html')).toHaveClass(/light/);
    await app.getByRole('button', { name: 'Done' }).click();
    await app.reload();
    await expect(app.locator('html')).toHaveClass(/light/);
  });

  test('dialogs close on Escape', async ({ app }) => {
    await app.getByRole('button', { name: 'Settings' }).click();
    await expect(app.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toHaveCount(0);
  });
});
