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
