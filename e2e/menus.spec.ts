import { test, expect, addTask, openTaskMenu } from './helpers';
import type { Page } from '@playwright/test';

const menu = (p: Page) => p.getByRole('menu');
const items = (p: Page) => menu(p).getByRole('menuitem').allInnerTexts();

test.describe('the task menu', () => {
  test('lists its actions and reports its own state', async ({ app }) => {
    await addTask(app, 'Alpha');
    const trigger = app.getByRole('button', { name: 'Task actions' }).first();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await items(app)).toEqual([
      'Edit', 'Subtasks', 'Move to tomorrow', 'Adjust tracked time', 'Delete',
    ]);
  });

  test('closes on Escape', async ({ app }) => {
    await addTask(app, 'Alpha');
    await openTaskMenu(app);
    await app.keyboard.press('Escape');
    await expect(menu(app)).toBeHidden();
  });

  test('closes on an outside click', async ({ app }) => {
    await addTask(app, 'Alpha');
    await openTaskMenu(app);
    await app.mouse.click(5, 5);
    await expect(menu(app)).toBeHidden();
  });

  test('Delete removes only the task it was opened on', async ({ app }) => {
    await addTask(app, 'Alpha');
    await addTask(app, 'Beta');
    await openTaskMenu(app);
    await menu(app).getByRole('menuitem', { name: 'Delete' }).click();
    await expect(app.getByRole('checkbox', { name: 'Alpha' })).toBeHidden();
    await expect(app.getByRole('checkbox', { name: 'Beta' })).toBeVisible();
  });

  test('Move to tomorrow takes it out of today', async ({ app }) => {
    await addTask(app, 'Alpha');
    await openTaskMenu(app);
    await menu(app).getByRole('menuitem', { name: 'Move to tomorrow' }).click();
    await expect(app.getByRole('checkbox', { name: 'Alpha' })).toBeHidden();
  });
});

test('the subtask menu offers Edit and Delete', async ({ app }) => {
  await addTask(app, 'Alpha');
  await openTaskMenu(app);
  await menu(app).getByRole('menuitem', { name: 'Subtasks' }).click();

  const sub = app.getByPlaceholder(/Add subtask/);
  await sub.fill('a step');
  await sub.press('Enter');
  await expect(app.getByRole('checkbox', { name: 'a step' })).toBeVisible();

  await app.getByRole('button', { name: 'Subtask actions' }).first().click({ force: true });
  expect(await items(app)).toEqual(['Edit', 'Delete']);
});

test.describe('the goal menu follows the goal type', () => {
  const addGoal = async (page: Page, type: 'Time' | 'Counter') => {
    await page.getByRole('button', { name: '+ Add Goal' }).click();
    const form = page.locator('form').last();
    await form.getByPlaceholder('Goal name…').fill('A goal');
    await form.getByRole('button', { name: type, exact: true }).click();
    await form.getByRole('spinbutton').first().fill('5');
    await form.getByRole('button', { name: 'Add Goal', exact: true }).click();
    await page.getByRole('button', { name: 'Goal actions' }).first().click();
    await expect(menu(page)).toBeVisible();
  };

  test('a time goal can have its tracked time adjusted', async ({ app }) => {
    await addGoal(app, 'Time');
    expect(await items(app)).toEqual(['Edit', 'Adjust time', 'Delete']);
  });

  test('a counter goal has no tracked time to adjust', async ({ app }) => {
    await addGoal(app, 'Counter');
    expect(await items(app)).toEqual(['Edit', 'Delete']);
  });
});
