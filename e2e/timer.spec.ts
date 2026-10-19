import { advance, expect, MIN, startState, test } from './helpers';

test.describe('the timer', () => {
  test('starts stopped with nothing running', async ({ app }) => {
    await expect(app.getByText('Stopped')).toBeVisible();
    await expect(app.getByTestId('balance')).toHaveText('0:00');
    await expect(app.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Fix timer' })).toHaveCount(0);
  });

  test('the mode picker is there while stopped and gone while something runs', async ({ app }) => {
    const picker = app.getByRole('group', { name: 'Timer mode' });
    await expect(picker.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'true');
    await expect(picker.getByRole('button', { name: 'Timed' })).toBeVisible();

    await startState(app, 'Focus');
    await expect(picker).toHaveCount(0);
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(picker).toBeVisible();
  });

  test('Focus earns one second of Rest for every three', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 3 * MIN);
    await expect(app.getByTestId('elapsed')).toHaveText('3:00');
    await expect(app.getByTestId('balance')).toHaveText('1:00');
    await expect(app.getByText('Rest available')).toBeVisible();
  });

  test('Rest spends the balance and can run it into debt', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 9 * MIN); // earns 3:00
    await startState(app, 'Rest');
    await advance(app, 2 * MIN);
    await expect(app.getByTestId('elapsed')).toHaveText('2:00');
    await expect(app.getByTestId('balance')).toHaveText('1:00');

    await advance(app, 2 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('1:00');
    await expect(app.getByText('Rest debt')).toBeVisible();
  });

  test('stopping stops the clock: time stops counting either way', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 6 * MIN);
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(app.getByText('Stopped')).toBeVisible();

    await advance(app, 30 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('2:00');
    await expect(app.getByTestId('totals')).toContainText('Focus 6m');
  });

  test('debt says how much Focus clears it', async ({ app }) => {
    await expect(app.getByTestId('debt-hint')).toHaveCount(0);

    await startState(app, 'Focus');
    await advance(app, 9 * MIN); // earns 3:00
    await startState(app, 'Rest');
    await advance(app, 3 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('0:00');
    await expect(app.getByTestId('debt-hint')).toHaveCount(0);

    await advance(app, MIN);
    await expect(app.getByText('Rest debt')).toBeVisible();
    await expect(app.getByTestId('balance')).toHaveText('1:00');
    await expect(app.getByTestId('debt-hint')).toHaveText('3m of Focus clears it');

    // Paying it back: 3 minutes of Focus earns exactly 1 minute.
    await startState(app, 'Focus');
    await advance(app, 3 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('0:00');
    await expect(app.getByTestId('debt-hint')).toHaveCount(0);
  });

  test('shows the day so far', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 60 * MIN);
    await startState(app, 'Rest');
    await advance(app, 15 * MIN);
    await expect(app.getByTestId('totals')).toContainText('Focus 1h');
    await expect(app.getByTestId('totals')).toContainText('Rest 15m');
    // An hour of Focus earned 20 minutes; 15 spent.
    await expect(app.getByTestId('balance')).toHaveText('5:00');
  });

  test('survives a reload with the timer still running', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 5 * MIN);
    await app.reload();
    await expect(app.getByText('Focus running')).toBeVisible();
    await expect(app.getByTestId('elapsed')).toHaveText(/^5:0\d$/);
  });

  test('a stint carries on across midnight, and the new day starts at zero', async ({ app }) => {
    await startState(app, 'Focus');
    await advance(app, 30 * MIN);
    // Jump to just after midnight in one step.
    await app.clock.fastForward('14:00:00');
    await expect(app.getByText('Focus running')).toBeVisible();
    // 00:00 to 00:30: half an hour of today's Focus, and its balance only.
    await expect(app.getByTestId('totals')).toContainText('Focus 30m');
    await expect(app.getByTestId('balance')).toHaveText('10:00');
  });
});
