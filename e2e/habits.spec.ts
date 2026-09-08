import { test, expect, switchTab } from './helpers';

async function addHabit(page: import('@playwright/test').Page, name: string) {
  const input = page.getByPlaceholder('Add a habit…');
  await input.fill(name);
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(input).toHaveValue('');
}

test.describe('habits', () => {
  test.beforeEach(async ({ app }) => {
    await switchTab(app, 'Habits');
  });

  test('empty state, then add a daily habit and check it off', async ({ app }) => {
    await expect(app.locator('main')).toContainText('No habits yet');

    await addHabit(app, 'Meditate');
    const box = app.getByRole('checkbox', { name: 'Meditate' });
    await expect(box).toBeVisible();
    await expect(app.locator('main')).toContainText('Daily');

    await expect(box).toHaveAttribute('aria-checked', 'false');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(app.locator('main')).toContainText('1 / 1 done');
  });

  test('a not-due weekday habit is hidden until "show all"', async ({ app }) => {
    await addHabit(app, 'Daily thing');

    // A weekday habit whose only day is NOT today.
    const todayIdx = (new Date().getDay() + 6) % 7;
    const otherDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(todayIdx + 2) % 7];

    await app.getByPlaceholder('Add a habit…').fill('Gym day');
    await app.getByRole('button', { name: 'Weekdays', exact: true }).click();
    await app.getByRole('button', { name: otherDay, exact: true }).click();
    const add = app.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeEnabled();
    await add.click();

    await expect(app.getByText('Gym day')).toBeHidden();
    await app.getByRole('button', { name: /Show all 2 habits/ }).click();
    await expect(app.getByText('Gym day')).toBeVisible();
  });

  test('every-N picker and a per-occurrence target', async ({ app }) => {
    await app.getByPlaceholder('Add a habit…').fill('Read');
    await app.getByRole('button', { name: 'Every N days', exact: true }).click();
    await app.getByRole('button', { name: 'More days' }).click(); // 3 -> 4
    await app.getByRole('button', { name: '+ Add a per-occurrence target' }).click();
    await app.getByLabel('Target amount').fill('2');
    await app.getByLabel('Target unit').fill('pages');
    const add = app.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeEnabled();
    await add.click();

    await expect(app.locator('main')).toContainText('Every 4 days');
    const more = app.getByRole('button', { name: 'Log more for Read' });
    await expect(app.locator('main')).toContainText('0/2 pages');
    await more.click();
    await more.click();
    await expect(app.locator('main')).toContainText('2/2 pages');
  });

  test('archive and restore', async ({ app }) => {
    await addHabit(app, 'Old habit');
    await app.getByRole('button', { name: 'Actions for Old habit' }).click();
    await app.getByRole('menuitem', { name: 'Archive' }).click();

    await expect(app.getByText('Old habit')).toBeHidden();
    await app.getByRole('button', { name: /1 archived habit/ }).click();
    await expect(app.getByText('Old habit')).toBeVisible();
    await app.getByRole('button', { name: 'Restore' }).click();
    await expect(app.getByRole('checkbox', { name: 'Old habit' })).toBeVisible();
  });
});
