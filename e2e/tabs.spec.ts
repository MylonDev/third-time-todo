import { test, expect, switchTab } from './helpers';

test.describe('the tab shell', () => {
  test('every tab is present and Tasks is the default', async ({ app }) => {
    for (const name of ['Tasks', 'Projects', 'Activity'])
      await expect(app.getByRole('tab', { name, exact: true })).toBeVisible();
    await expect(app.getByRole('tab', { name: 'Tasks', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(app.getByPlaceholder('Add a task…')).toBeVisible();
  });

  test('switching tabs swaps the panel', async ({ app }) => {
    await switchTab(app, 'Projects');
    await expect(app.locator('main')).toContainText('No projects yet');
    await expect(app.getByPlaceholder('Add a task…')).toBeHidden();

    await switchTab(app, 'Tasks');
    await expect(app.getByPlaceholder('Add a task…')).toBeVisible();
  });

  test('the chosen tab survives a reload', async ({ app }) => {
    await switchTab(app, 'Projects');
    await app.reload();
    await expect(app.getByRole('tab', { name: 'Projects', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('each empty tab states that it is empty', async ({ app }) => {
    await switchTab(app, 'Projects');
    await expect(app.locator('main')).toContainText('No projects yet');
  });

  test('a stored "goals" tab migrates to Projects, not Tasks', async ({ app }) => {
    await app.evaluate(() => {
      localStorage.setItem(
        'tt-settings',
        JSON.stringify({ state: { activeTab: 'goals' }, version: 9 })
      );
    });
    await app.reload();
    await expect(app.getByRole('tab', { name: 'Projects', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('a stored "habits" tab at the same old version still lands on Tasks', async ({ app }) => {
    // Both the habits→tasks leg and the goals→projects leg apply to a v9
    // blob; this is the case that only passes if both legs actually run.
    await app.evaluate(() => {
      localStorage.setItem(
        'tt-settings',
        JSON.stringify({ state: { activeTab: 'habits' }, version: 9 })
      );
    });
    await app.reload();
    await expect(app.getByRole('tab', { name: 'Tasks', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
