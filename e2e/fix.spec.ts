import { advance, expect, MIN, startState, test } from './helpers';

async function openFix(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Fix timer' }).click();
  await expect(page.getByRole('dialog', { name: 'Fix timer' })).toBeVisible();
}

test.describe('fixing the timer', () => {
  test('I was on Want for the last 20 minutes and am still on it', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 30 * MIN);
    await openFix(app);

    const dialog = app.getByRole('dialog', { name: 'Fix timer' });
    await dialog.getByRole('button', { name: '15 min' }).click();
    await dialog.getByRole('spinbutton', { name: 'Minutes' }).fill('20');
    await dialog.getByRole('group', { name: 'Those minutes were' }).getByRole('button', { name: 'Want' }).click();
    await dialog.getByRole('group', { name: 'Since then' }).getByRole('button', { name: 'Want' }).click();
    await expect(dialog.getByTestId('fix-preview')).toContainText('Want from');
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(app.getByText('Want running')).toBeVisible();
    await expect(app.getByTestId('elapsed')).toHaveText('20:00');
    await expect(app.getByTestId('totals')).toContainText('Should 10m');
    await expect(app.getByTestId('totals')).toContainText('Want 20m');
    // 10 min of Should earned 3:20; 20 min of Want spent.
    await expect(app.getByTestId('balance')).toHaveText('16:40');
    await expect(app.getByText('Want debt')).toBeVisible();
  });

  test('defaults to the opposite state, and I am back on the original', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 30 * MIN);
    await openFix(app);
    const dialog = app.getByRole('dialog', { name: 'Fix timer' });
    await dialog.getByRole('button', { name: '10 min' }).click();
    // Defaults: those minutes were Want, since then Should.
    await expect(dialog.getByRole('group', { name: 'Those minutes were' }).getByRole('button', { name: 'Want' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(app.getByText('Should running')).toBeVisible();
    await expect(app.getByTestId('elapsed')).toHaveText('0:00');
    await expect(app.getByTestId('totals')).toContainText('Should 20m');
    await expect(app.getByTestId('totals')).toContainText('Want 10m');
  });

  test('I forgot to stop it', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 30 * MIN);
    await openFix(app);
    const dialog = app.getByRole('dialog', { name: 'Fix timer' });
    await dialog.getByRole('button', { name: '15 min' }).click();
    await dialog.getByRole('group', { name: 'Those minutes were' }).getByRole('button', { name: 'Rest' }).click();
    await dialog.getByRole('group', { name: 'Since then' }).getByRole('button', { name: 'Stopped' }).click();
    await expect(dialog.getByTestId('fix-preview')).toContainText('then the timer stops');
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(app.getByText('Resting')).toBeVisible();
    await expect(app.getByTestId('totals')).toContainText('Should 15m');
    await expect(app.getByTestId('balance')).toHaveText('5:00');
  });

  test('refuses nonsense and more than 12 hours', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, MIN);
    await openFix(app);
    const dialog = app.getByRole('dialog', { name: 'Fix timer' });
    await dialog.getByRole('spinbutton', { name: 'Minutes' }).fill('0');
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await dialog.getByRole('spinbutton', { name: 'Minutes' }).fill('721');
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await expect(dialog.getByTestId('fix-preview')).toContainText('12 hours');
  });

  test('Escape closes it without changing anything', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 5 * MIN);
    await openFix(app);
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toHaveCount(0);
    await expect(app.getByTestId('totals')).toContainText('Should 5m');
  });
});
