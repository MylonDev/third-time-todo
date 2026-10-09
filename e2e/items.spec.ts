import { addItem, expect, test } from './helpers';

test.describe('today and later', () => {
  test('adds Should and Want items and checks them off', async ({ app }) => {
    await addItem(app, 'Should', 'File taxes');
    await addItem(app, 'Want', 'Play guitar');

    const taxes = app.getByRole('checkbox', { name: 'File taxes' });
    await taxes.check();
    await expect(taxes).toBeChecked();
    await taxes.uncheck();
    await expect(taxes).not.toBeChecked();

    await app.getByRole('checkbox', { name: 'Play guitar' }).check();
    await expect(app.getByRole('checkbox', { name: 'Play guitar' })).toBeChecked();
  });

  test('keeps items across a reload', async ({ app }) => {
    await addItem(app, 'Should', 'Write report');
    await app.reload();
    await expect(app.getByRole('checkbox', { name: 'Write report' })).toBeVisible();
  });

  test('Later holds undated items, kept out of Today', async ({ app }) => {
    await app.getByRole('button', { name: 'Later', exact: true }).click();
    await addItem(app, 'Want', 'Learn piano');
    await expect(app.getByText('Someday')).toBeVisible();

    await app.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(app.getByRole('checkbox', { name: 'Learn piano' })).toHaveCount(0);
  });

  test('moving an item to today brings it into Today', async ({ app }) => {
    await app.getByRole('button', { name: 'Later', exact: true }).click();
    await addItem(app, 'Should', 'Renew passport');

    await app.getByRole('button', { name: 'Edit Renew passport' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit item' });
    await dialog.getByRole('button', { name: 'Today', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(app.getByRole('checkbox', { name: 'Renew passport' })).toHaveCount(0);

    await app.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(app.getByRole('checkbox', { name: 'Renew passport' })).toBeVisible();
  });

  test('tomorrow shows under Later with its date', async ({ app }) => {
    await addItem(app, 'Should', 'Dentist');
    await app.getByRole('button', { name: 'Edit Dentist' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit item' });
    await dialog.getByRole('button', { name: 'Tomorrow' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(app.getByRole('checkbox', { name: 'Dentist' })).toHaveCount(0);

    await app.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(app.getByRole('checkbox', { name: 'Dentist' })).toBeVisible();
    await expect(app.getByText('Tomorrow', { exact: true })).toBeVisible();
  });

  test('overdue items stay in Today and say how late they are', async ({ app }) => {
    await addItem(app, 'Should', 'Call the bank');
    await app.clock.fastForward('24:00:00');
    await expect(app.getByRole('checkbox', { name: 'Call the bank' })).toBeVisible();
    await expect(app.getByText('1 day overdue')).toBeVisible();

    await app.clock.fastForward('48:00:00');
    await expect(app.getByText('3 days overdue')).toBeVisible();
  });

  test('items checked off today stay visible, and are gone tomorrow', async ({ app }) => {
    await addItem(app, 'Should', 'Pay rent');
    await app.getByRole('checkbox', { name: 'Pay rent' }).check();
    await app.clock.fastForward('24:00:00');
    await expect(app.getByRole('checkbox', { name: 'Pay rent' })).toHaveCount(0);
  });

  test('deletes an item', async ({ app }) => {
    await addItem(app, 'Want', 'Doomscroll');
    await app.getByRole('button', { name: 'Edit Doomscroll' }).click();
    await app.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(app.getByRole('checkbox', { name: 'Doomscroll' })).toHaveCount(0);
  });
});

test.describe('recurring items', () => {
  async function makeDaily(page: import('@playwright/test').Page, text: string) {
    await page.getByRole('button', { name: `Edit ${text}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit item' });
    await dialog.getByLabel('Repeat').selectOption('daily');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('↻ Daily')).toBeVisible();
  }

  test('checking off a daily item brings it back tomorrow', async ({ app }) => {
    await addItem(app, 'Want', 'Read a chapter');
    await makeDaily(app, 'Read a chapter');

    await app.getByRole('checkbox', { name: 'Read a chapter' }).check();
    await app.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(app.getByRole('checkbox', { name: 'Read a chapter' })).toBeVisible();
    await expect(app.getByText('Tomorrow', { exact: true })).toBeVisible();

    await app.clock.fastForward('24:00:00');
    await app.getByRole('button', { name: 'Today', exact: true }).click();
    // Yesterday's is done and gone; today's fresh one is waiting.
    await expect(app.getByRole('checkbox', { name: 'Read a chapter' })).toHaveCount(1);
    await expect(app.getByRole('checkbox', { name: 'Read a chapter' })).not.toBeChecked();
  });

  test('unchecking takes the next one back', async ({ app }) => {
    await addItem(app, 'Should', 'Stretch');
    await makeDaily(app, 'Stretch');
    const box = app.getByRole('checkbox', { name: 'Stretch' });
    await box.check();
    await box.uncheck();
    await app.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(app.getByRole('checkbox', { name: 'Stretch' })).toHaveCount(0);
  });

  test('weekday repeats need at least one day', async ({ app }) => {
    await addItem(app, 'Should', 'Gym');
    await app.getByRole('button', { name: 'Edit Gym' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit item' });
    await dialog.getByLabel('Repeat').selectOption('weekdays');
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Wednesday' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(app.getByText('↻ Wed')).toBeVisible();

    // Monday today: completing it moves it to Wednesday.
    await app.getByRole('checkbox', { name: 'Gym' }).check();
    await app.getByRole('button', { name: 'Later', exact: true }).click();
    // The heading is locale formatted ("Wed, Oct 14"), so match the weekday and day.
    await expect(app.getByText(/^Wed.*14/)).toBeVisible();
  });

  test('skipping brings the next one forward without doing this one', async ({ app }) => {
    await addItem(app, 'Should', 'Water plants');
    await makeDaily(app, 'Water plants');
    await app.getByRole('button', { name: 'Edit Water plants' }).click();
    await app.getByRole('dialog').getByRole('button', { name: 'Skip this one' }).click();
    await expect(app.getByRole('checkbox', { name: 'Water plants' })).toHaveCount(0);
    await app.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(app.getByRole('checkbox', { name: 'Water plants' })).toBeVisible();
  });
});
