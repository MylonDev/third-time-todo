import { test, expect, startSession } from './helpers';
import type { Page } from '@playwright/test';

const dialog = (p: Page) => p.getByRole('dialog');
const focusIsInDialog = (p: Page) =>
  p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

test.describe('every overlay is a real dialog', () => {
  test('the Options sheet announces itself, traps focus and locks the page', async ({ app }) => {
    await app.getByRole('button', { name: 'Options' }).click();
    await expect(dialog(app)).toBeVisible();

    await expect(dialog(app)).toHaveAttribute('aria-modal', 'true');
    await expect(dialog(app)).toHaveAttribute('aria-label', 'Options');

    // Portalled to <body>, not nested inside the app root.
    expect(
      await dialog(app).evaluate((e) => e.parentElement?.parentElement?.tagName)
    ).toBe('BODY');

    expect(await app.evaluate(() => document.body.style.overflow)).toBe('hidden');
    expect(await focusIsInDialog(app)).toBe(true);

    for (let i = 0; i < 40; i++) {
      await app.keyboard.press('Tab');
      expect(await focusIsInDialog(app), `focus escaped after ${i + 1} tabs`).toBe(true);
    }

    await app.keyboard.press('Escape');
    await expect(dialog(app)).toBeHidden();
    expect(await app.evaluate(() => document.body.style.overflow), 'scroll lock stuck').toBe('');
  });

  test('a scrim click closes the Routines dialog', async ({ app }) => {
    await app.getByRole('button', { name: 'Manage' }).click();
    await expect(dialog(app)).toBeVisible();
    await app.mouse.click(8, 8);
    await expect(dialog(app)).toBeHidden();
  });

  test('End Session opens a labelled dialog and Escape closes it', async ({ app }) => {
    await startSession(app);
    await app.getByRole('button', { name: 'End Session' }).click();
    await expect(dialog(app)).toHaveAttribute('aria-label', 'End the session');
    await app.keyboard.press('Escape');
    await expect(dialog(app)).toBeHidden();
  });
});

test.describe('the restore prompt demands an answer', () => {
  test('Escape and a scrim click leave it standing; a choice closes it', async ({ app }) => {
    await startSession(app);
    await app.reload(); // a session was running when the page went away

    await expect(dialog(app)).toBeVisible();
    await expect(dialog(app)).toHaveAttribute('aria-label', 'Pick up your session');

    await app.keyboard.press('Escape');
    await app.mouse.click(8, 8);
    await app.waitForTimeout(400);
    await expect(dialog(app), 'dismissed without a choice').toBeVisible();

    await app.getByRole('button', { name: /Reset/ }).click();
    await expect(dialog(app)).toBeHidden();
  });
});
