import { addPractice, expect, openPractices, pickLevel, test } from './helpers';

test.describe('practices', () => {
  test('starts empty, and says what a practice is', async ({ app }) => {
    await openPractices(app);
    await expect(app.getByText('No practices yet.')).toBeVisible();
    await expect(app.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  });

  test('adds a practice with its steps and what they need', async ({ app }) => {
    await openPractices(app);
    await app.getByRole('button', { name: 'Add practice' }).click();
    const dialog = app.getByRole('dialog', { name: 'Add practice' });

    // A name is required.
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Name').fill('Guitar');
    await expect(save).toBeEnabled();

    // Steady is the default, and each level shows its target.
    await expect(dialog.getByRole('button', { name: /^Steady/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: /^Steady/ })).toContainText('4× · 20 min');

    await dialog.getByLabel('Small step', { exact: true }).fill('Play one scale');
    await dialog.getByRole('group', { name: 'Small step needs' }).getByRole('button', { name: 'Clarity' }).click();
    await dialog.getByLabel('Low-day step', { exact: true }).fill('Hold the guitar');
    await expect(dialog.getByRole('group', { name: 'Low-day step needs' }).getByText('Little of either')).toBeVisible();
    await save.click();

    const row = app.getByRole('button', { name: 'Edit Guitar' });
    await expect(row).toContainText('4× a week · 20 min');
    await expect(app.getByText('No practices yet.')).toHaveCount(0);

    // Everything was kept.
    await row.click();
    const editor = app.getByRole('dialog', { name: 'Edit practice' });
    const smallNeeds = editor.getByRole('group', { name: 'Small step needs' });
    await expect(editor.getByLabel('Small step', { exact: true })).toHaveValue('Play one scale');
    await expect(editor.getByLabel('Low-day step', { exact: true })).toHaveValue('Hold the guitar');
    await expect(smallNeeds.getByRole('button', { name: 'Clarity' })).toHaveAttribute('aria-pressed', 'true');
    await expect(smallNeeds.getByRole('button', { name: 'Energy' })).toHaveAttribute('aria-pressed', 'false');
    await expect(smallNeeds.getByText('Little of either')).toHaveCount(0);
  });

  test('changes the level and the name', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar', 'Serious');
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('6× a week · 30 min');

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit practice' });
    await pickLevel(app, 'Light');
    await dialog.getByLabel('Name').fill('Classical guitar');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Edit Classical guitar' })).toContainText('3× a week · 15 min');
  });

  test('a paused practice is dimmed and listed last', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar');
    await addPractice(app, 'Drawing');
    await addPractice(app, 'Spanish');
    const rows = app.getByRole('button', { name: /^Edit / });
    await expect(rows).toHaveText([/Guitar/, /Drawing/, /Spanish/]);

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await pickLevel(app, 'Paused');
    await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();

    await expect(rows).toHaveText([/Drawing/, /Spanish/, /Guitar/]);
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Paused');
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveAttribute('data-paused', 'true');
    await expect(app.getByRole('button', { name: 'Edit Drawing' })).toHaveAttribute('data-paused', 'false');

    // Un-pausing puts it back where it was.
    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await pickLevel(app, 'Light');
    await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();
    await expect(rows).toHaveText([/Guitar/, /Drawing/, /Spanish/]);
  });

  test('delete asks first, and can be backed out of', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar');

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit practice' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog.getByText('Delete Guitar?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(dialog.getByText('Delete Guitar?')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toBeVisible();

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete Guitar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveCount(0);
    await expect(app.getByText('No practices yet.')).toBeVisible();
  });

  test('keeps practices across a reload', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar', 'Minimal');
    await app.reload();
    await openPractices(app);
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('1× a week · 10 min');
  });

  test('cancel adds nothing', async ({ app }) => {
    await openPractices(app);
    await app.getByRole('button', { name: 'Add practice' }).click();
    const dialog = app.getByRole('dialog', { name: 'Add practice' });
    await dialog.getByLabel('Name').fill('Nothing');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.getByText('No practices yet.')).toBeVisible();
  });
});
