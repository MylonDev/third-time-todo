import { test, expect, sectionHeader } from './helpers';

test.describe('an empty store still shows the whole page', () => {
  test('all three sections are present and named', async ({ app }) => {
    for (const name of ['Tasks', 'Routines', 'Goals'])
      await expect(app.getByRole('heading', { name, exact: true })).toBeVisible();
  });

  test('each section says it is empty', async ({ app }) => {
    const main = app.locator('main');
    for (const phrase of ['No tasks yet', 'No routines yet', 'No goals yet'])
      await expect(main).toContainText(phrase);
  });

  test('Routines keeps its own entry point rather than borrowing the Tasks header', async ({ app }) => {
    await expect(sectionHeader(app, 'Routines')).toContainText('none yet');
    await expect(
      sectionHeader(app, 'Routines').getByRole('button', { name: 'Manage' })
    ).toBeVisible();

    // The Tasks header used to grow a "Routines" button whenever the Routines
    // section had removed itself.
    const borrowed = await sectionHeader(app, 'Tasks').getByRole('button').allInnerTexts();
    expect(borrowed.filter((b) => /Routines/.test(b))).toEqual([]);
  });

  test('adding a routine leaves the section and its control where they were', async ({ app }) => {
    await app.getByRole('button', { name: 'Manage' }).click();
    const add = app.getByPlaceholder(/routine/i).first();
    await add.fill('Morning');
    await add.press('Enter');
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toBeHidden();

    await expect(app.getByRole('heading', { name: 'Routines', exact: true })).toBeVisible();
    await expect(
      sectionHeader(app, 'Routines').getByRole('button', { name: 'Manage' })
    ).toBeVisible();
  });
});
