import { advance, expect, MIN, startState, test } from './helpers';

test.describe('the timer', () => {
  test('starts resting with nothing running', async ({ app }) => {
    await expect(app.getByText('Resting')).toBeVisible();
    await expect(app.getByTestId('balance')).toHaveText('0:00');
    await expect(app.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Fix timer' })).toHaveCount(0);
  });

  test('Should earns one second of Want for every three', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 3 * MIN);
    await expect(app.getByTestId('elapsed')).toHaveText('3:00');
    await expect(app.getByTestId('balance')).toHaveText('1:00');
    await expect(app.getByText('Want available')).toBeVisible();
  });

  test('Want spends the balance and can run it into debt', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 9 * MIN); // earns 3:00
    await startState(app, 'Want');
    await advance(app, 2 * MIN);
    await expect(app.getByTestId('elapsed')).toHaveText('2:00');
    await expect(app.getByTestId('balance')).toHaveText('1:00');

    await advance(app, 2 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('1:00');
    await expect(app.getByText('Want debt')).toBeVisible();
  });

  test('stopping rests: time stops counting either way', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 6 * MIN);
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(app.getByText('Resting')).toBeVisible();

    await advance(app, 30 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('2:00');
    await expect(app.getByTestId('totals')).toContainText('Should 6m');
  });

  test('shows the day so far', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 60 * MIN);
    await startState(app, 'Want');
    await advance(app, 15 * MIN);
    await expect(app.getByTestId('totals')).toContainText('Should 1h');
    await expect(app.getByTestId('totals')).toContainText('Want 15m');
    // An hour of Should earned 20 minutes; 15 spent.
    await expect(app.getByTestId('balance')).toHaveText('5:00');
  });

  test('survives a reload with the timer still running', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 5 * MIN);
    await app.reload();
    await expect(app.getByText('Should running')).toBeVisible();
    await expect(app.getByTestId('elapsed')).toHaveText(/^5:0\d$/);
  });

  test('a stint carries on across midnight, and the new day starts at zero', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 30 * MIN);
    // Jump to just after midnight in one step.
    await app.clock.fastForward('14:00:00');
    await expect(app.getByText('Should running')).toBeVisible();
    // 00:00 to 00:30: half an hour of today's Should, and its balance only.
    await expect(app.getByTestId('totals')).toContainText('Should 30m');
    await expect(app.getByTestId('balance')).toHaveText('10:00');
  });
});
