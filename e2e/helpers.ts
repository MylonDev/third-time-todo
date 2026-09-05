import { expect, type Page, test as base } from '@playwright/test';

/**
 * Every spec starts from an empty store. The app has no backend, so "reset"
 * means clearing localStorage and reloading.
 */
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Third Time' })).toBeVisible();

    await use(page);

    // A clean console is part of passing. The service worker 404 that used to
    // fire on every load was found this way.
    expect(errors, 'browser reported errors').toEqual([]);
  },
});

export { expect };

export async function addTask(page: Page, title: string) {
  const input = page.getByPlaceholder('Add a task…');
  await input.fill(title);
  await input.press('Enter');
  await expect(page.getByRole('checkbox', { name: title })).toBeVisible();
}

export async function startSession(page: Page) {
  await page.getByRole('button', { name: 'Start →' }).click();
  await expect(page.getByRole('button', { name: 'End Day' })).toBeVisible();
}

export async function openTaskMenu(page: Page) {
  await page.getByRole('button', { name: 'Task actions' }).first().click();
  await expect(page.getByRole('menu')).toBeVisible();
}

/** Every M:SS / H:MM:SS figure currently on the page. */
export function readTimers(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.font-timer, .num')]
      .map((e) => e.textContent?.trim() ?? '')
      .filter((t) => /^\d+:\d\d/.test(t))
  );
}

/** The header row of a top-level collapsible section. */
export function sectionHeader(page: Page, name: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .locator('> div')
    .first();
}
