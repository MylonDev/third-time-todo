import { test, expect } from './helpers';

test.describe('the end of the day', () => {
  test('defaults to midnight and offers up to 4 AM', async ({ app }) => {
    await app.getByRole('button', { name: 'Options' }).click();
    const select = app.getByLabel('My day ends at');
    await expect(select).toHaveValue('0');
    await expect(select.getByRole('option')).toHaveCount(5);
    await expect(select.getByRole('option', { name: '4 AM' })).toBeAttached();
  });

  test('the choice survives a reload', async ({ app }) => {
    await app.getByRole('button', { name: 'Options' }).click();
    await app.getByLabel('My day ends at').selectOption('2');
    await app.reload();
    await app.getByRole('button', { name: 'Options' }).click();
    await expect(app.getByLabel('My day ends at')).toHaveValue('2');
  });

  test('work in the small hours files under the previous day', async ({ app }) => {
    // 01:30, with the day ending at 2 AM, is still yesterday.
    await app.getByRole('button', { name: 'Options' }).click();
    await app.getByLabel('My day ends at').selectOption('2');
    // The panel has no "Close" button — it's a sheet dismissed by its own
    // ✕ control, labelled the way Modal.tsx renders it everywhere else.
    await app.getByRole('button', { name: 'Close options' }).click();

    const key = await app.evaluate(() => {
      const t = new Date();
      t.setHours(1, 30, 0, 0);
      // @ts-expect-error — test hook, see Step 4
      return window.__ttDayKeyOf(t.getTime(), 2);
    });
    const expected = await app.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
              String(d.getDate()).padStart(2, '0')].join('-');
    });
    expect(key).toBe(expected);
  });
});
