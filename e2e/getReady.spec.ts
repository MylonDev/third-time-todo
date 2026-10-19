import type { Page } from '@playwright/test';
import { advance, expect, MIN, test } from './helpers';

const focusTile = (page: Page) => page.getByRole('group', { name: 'Timer state' }).getByRole('button', { name: 'Focus', exact: true });
const modal = (page: Page) => page.getByRole('dialog', { name: 'Get ready' });

/** Put steps in the checklist from Settings, one Enter at a time. */
async function addSteps(page: Page, ...texts: string[]) {
  await page.getByRole('button', { name: 'Settings' }).click();
  for (const text of texts) {
    const field = page.getByRole('textbox', { name: 'Add a get ready step' });
    await field.fill(text);
    await field.press('Enter');
    await expect(page.getByRole('button', { name: `Remove ${text}` })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Done' }).click();
}

/** The saved day rows, as the app keeps them. */
async function savedDays(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('tt2-getready');
    return raw ? (JSON.parse(raw).state.days as { id: string; done: string[]; skipped: boolean }[]) : [];
  });
}

test.describe('get ready', () => {
  test('with no steps, Start runs at once', async ({ app }) => {
    await focusTile(app).click();
    await expect(focusTile(app)).toHaveAttribute('aria-pressed', 'true');
    await expect(modal(app)).toHaveCount(0);
    expect(await savedDays(app)).toEqual([]);
  });

  test('the first Start of the day offers the steps; ticking is kept and the second Start goes straight in', async ({ app }) => {
    await addSteps(app, 'Water', 'Clear desk');

    await focusTile(app).click();
    await expect(modal(app)).toBeVisible();
    await expect(focusTile(app)).toHaveAttribute('aria-pressed', 'false');
    await modal(app).getByRole('checkbox', { name: 'Water' }).check();
    await modal(app).getByRole('button', { name: 'Start', exact: true }).click();

    await expect(modal(app)).toHaveCount(0);
    await expect(focusTile(app)).toHaveAttribute('aria-pressed', 'true');
    await advance(app, 5 * MIN);
    await expect(app.getByTestId('elapsed')).toHaveText('5:00');

    const days = await savedDays(app);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ id: '2026-10-12', skipped: false });
    expect(days[0].done).toHaveLength(1);

    await app.getByRole('button', { name: 'Stop' }).click();
    await focusTile(app).click();
    await expect(modal(app)).toHaveCount(0);
    await expect(focusTile(app)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Start works with nothing ticked', async ({ app }) => {
    await addSteps(app, 'Water');
    await focusTile(app).click();
    await modal(app).getByRole('button', { name: 'Start', exact: true }).click();
    await expect(focusTile(app)).toHaveAttribute('aria-pressed', 'true');
    expect(await savedDays(app)).toMatchObject([{ id: '2026-10-12', done: [], skipped: false }]);
  });

  test('Skip starts at once and is not offered again that day', async ({ app }) => {
    await addSteps(app, 'Water');
    await focusTile(app).click();
    await modal(app).getByRole('button', { name: 'Skip' }).click();

    await expect(modal(app)).toHaveCount(0);
    await expect(focusTile(app)).toHaveAttribute('aria-pressed', 'true');
    expect(await savedDays(app)).toMatchObject([{ id: '2026-10-12', done: [], skipped: true }]);

    await app.getByRole('button', { name: 'Stop' }).click();
    await focusTile(app).click();
    await expect(modal(app)).toHaveCount(0);
  });

  test('is offered again the next day', async ({ app }) => {
    await addSteps(app, 'Water');
    await focusTile(app).click();
    await modal(app).getByRole('button', { name: 'Skip' }).click();
    await app.getByRole('button', { name: 'Stop' }).click();

    // 10:00 + 15h is 01:00 the next day.
    await advance(app, 15 * 60 * MIN);
    await focusTile(app).click();
    await expect(modal(app)).toBeVisible();
    await modal(app).getByRole('checkbox', { name: 'Water' }).check();
    await modal(app).getByRole('button', { name: 'Start', exact: true }).click();

    const days = await savedDays(app);
    expect(days.map((d) => d.id).sort()).toEqual(['2026-10-12', '2026-10-13']);
    expect(days.find((d) => d.id === '2026-10-13')).toMatchObject({ skipped: false });
  });

  test('a Timed start is offered too, and starts the timer on Start', async ({ app }) => {
    await addSteps(app, 'Water');
    await app.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
    await app.getByRole('button', { name: '10 min', exact: true }).click();
    await app.getByRole('button', { name: 'Start', exact: true }).click();

    await expect(modal(app)).toBeVisible();
    await expect(app.getByText('Timed running')).toHaveCount(0);
    await modal(app).getByRole('button', { name: 'Start', exact: true }).click();

    await expect(app.getByText('Timed running')).toBeVisible();
    await expect(app.getByTestId('planned')).toHaveText('of 10m');
  });

  test('switching between Focus and Rest while running never offers it', async ({ app }) => {
    await addSteps(app, 'Water');
    await focusTile(app).click();
    await modal(app).getByRole('button', { name: 'Skip' }).click();

    await app.getByRole('group', { name: 'Timer state' }).getByRole('button', { name: 'Rest', exact: true }).click();
    await expect(modal(app)).toHaveCount(0);
    await expect(app.getByText('Rest running')).toBeVisible();
  });

  test('Escape starts nothing and records nothing, so it is offered again', async ({ app }) => {
    await addSteps(app, 'Water');
    await focusTile(app).click();
    await expect(modal(app)).toBeVisible();
    await app.keyboard.press('Escape');

    await expect(modal(app)).toHaveCount(0);
    await expect(focusTile(app)).toHaveAttribute('aria-pressed', 'false');
    await expect(app.getByText('Stopped')).toBeVisible();
    expect(await savedDays(app)).toEqual([]);

    await focusTile(app).click();
    await expect(modal(app)).toBeVisible();
  });

  test('steps are edited in Settings and kept across a reload', async ({ app }) => {
    await addSteps(app, 'Water', 'Desk');
    await app.getByRole('button', { name: 'Settings' }).click();

    const first = app.getByRole('textbox', { name: 'Get ready step 1' });
    await first.fill('Big glass of water');
    await first.press('Enter');
    await app.getByRole('button', { name: 'Remove Desk' }).click();
    await app.getByRole('button', { name: 'Done' }).click();

    await app.reload();
    await app.getByRole('button', { name: 'Settings' }).click();
    await expect(app.getByRole('textbox', { name: 'Get ready step 1' })).toHaveValue('Big glass of water');
    await expect(app.getByRole('textbox', { name: 'Get ready step 2' })).toHaveCount(0);
  });

  test('a step typed but not confirmed is kept when Settings closes on Escape', async ({ app }) => {
    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByRole('textbox', { name: 'Add a get ready step' }).fill('Open the window');
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toHaveCount(0);

    await app.getByRole('button', { name: 'Settings' }).click();
    await expect(app.getByRole('textbox', { name: 'Get ready step 1' })).toHaveValue('Open the window');
  });

  test('clearing a step and closing Settings on Escape keeps the step', async ({ app }) => {
    await addSteps(app, 'Water');
    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByRole('textbox', { name: 'Get ready step 1' }).fill('');
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toHaveCount(0);

    await app.getByRole('button', { name: 'Settings' }).click();
    await expect(app.getByRole('textbox', { name: 'Get ready step 1' })).toHaveValue('Water');
  });

  test('a blank step is dropped', async ({ app }) => {
    await addSteps(app, 'Water');
    await app.getByRole('button', { name: 'Settings' }).click();
    const first = app.getByRole('textbox', { name: 'Get ready step 1' });
    await first.fill('   ');
    await first.press('Enter');
    await expect(app.getByRole('textbox', { name: 'Get ready step 1' })).toHaveCount(0);

    await app.getByRole('textbox', { name: 'Add a get ready step' }).fill('   ');
    await app.getByRole('textbox', { name: 'Add a get ready step' }).press('Enter');
    await expect(app.getByRole('textbox', { name: 'Get ready step 1' })).toHaveCount(0);
  });
});
