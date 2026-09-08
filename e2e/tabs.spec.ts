import { test, expect, switchTab } from './helpers';

test.describe('the tab shell', () => {
  test('every tab is present and Tasks is the default', async ({ app }) => {
    for (const name of ['Habits', 'Tasks', 'Goals', 'Activity'])
      await expect(app.getByRole('tab', { name, exact: true })).toBeVisible();
    await expect(app.getByRole('tab', { name: 'Tasks', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(app.getByPlaceholder('Add a task…')).toBeVisible();
  });

  test('switching tabs swaps the panel', async ({ app }) => {
    await switchTab(app, 'Habits');
    await expect(app.getByPlaceholder('Add a habit…')).toBeVisible();
    await expect(app.getByPlaceholder('Add a task…')).toBeHidden();

    await switchTab(app, 'Goals');
    await expect(app.locator('main')).toContainText('No goals yet');
  });

  test('the chosen tab survives a reload', async ({ app }) => {
    await switchTab(app, 'Goals');
    await app.reload();
    await expect(app.getByRole('tab', { name: 'Goals', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('each empty tab states that it is empty', async ({ app }) => {
    await switchTab(app, 'Habits');
    await expect(app.locator('main')).toContainText('No habits yet');
    await switchTab(app, 'Goals');
    await expect(app.locator('main')).toContainText('No goals yet');
  });
});
