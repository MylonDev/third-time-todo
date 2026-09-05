import { test, expect, addTask, openTaskMenu } from './helpers';
import type { Page } from '@playwright/test';

const menu = (p: Page) => p.getByRole('menu');
const editor = (p: Page) => p.getByRole('textbox').nth(1);

test.describe('editing a task title', () => {
  test('Enter commits', async ({ app }) => {
    await addTask(app, 'Alpha');
    await openTaskMenu(app);
    await menu(app).getByRole('menuitem', { name: 'Edit' }).click();
    await editor(app).fill('Renamed');
    await editor(app).press('Enter');
    await expect(app.getByRole('checkbox', { name: 'Renamed' })).toBeVisible();
  });

  test('Escape abandons', async ({ app }) => {
    await addTask(app, 'Alpha');
    await openTaskMenu(app);
    await menu(app).getByRole('menuitem', { name: 'Edit' }).click();
    await editor(app).fill('Discard me');
    await editor(app).press('Escape');
    await expect(app.getByRole('checkbox', { name: 'Alpha' })).toBeVisible();
    await expect(app.getByRole('checkbox', { name: 'Discard me' })).toBeHidden();
  });
});

test.describe('adjusting tracked time', () => {
  const openAdjuster = async (page: Page) => {
    await addTask(page, 'Alpha');
    await openTaskMenu(page);
    await menu(page).getByRole('menuitem', { name: 'Adjust tracked time' }).click();
    return page.getByPlaceholder('±min');
  };

  test('Enter applies the adjustment', async ({ app }) => {
    const field = await openAdjuster(app);
    await field.fill('5');
    await field.press('Enter');
    await expect(app.locator('li').filter({ hasText: 'Alpha' }).first()).toContainText('5:00');
  });

  test('Escape abandons it', async ({ app }) => {
    const field = await openAdjuster(app);
    await field.fill('99');
    await field.press('Escape');
    await expect(app.locator('li').filter({ hasText: 'Alpha' }).first()).not.toContainText('99:00');
  });
});

test.describe('an editor inside a dialog keeps its own Escape', () => {
  const openRoutineTitleEditor = async (page: Page) => {
    await page.getByRole('button', { name: 'Manage' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const add = page.getByPlaceholder(/routine/i).first();
    await add.fill('Morning');
    await add.press('Enter');
    await page.getByRole('button', { name: 'Morning', exact: true }).first().click();
  };

  // Regression: Escape used to bubble past the editor and close the whole dialog.
  test('the first Escape cancels the edit, the second closes the dialog', async ({ app }) => {
    await openRoutineTitleEditor(app);

    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog'), 'the whole dialog closed').toBeVisible();
    await expect(app.getByText('Morning').first()).toBeVisible();

    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toBeHidden();
  });
});
