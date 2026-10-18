import { expect, type Page, test as base } from '@playwright/test';

/** Monday 12 Oct 2026, 10:00 local. Every spec starts here with the clock paused. */
const START = new Date(2026, 9, 12, 10, 0, 0);

/**
 * Each test gets a fresh browser context, so localStorage starts empty. The
 * clock is fake and paused: time moves only when a test says so, which makes
 * every figure on the timer exact.
 */
export const test = base.extend<{ app: Page; allowedErrors: RegExp[] }>({
  /** Console errors a test expects, such as the browser's note of a refused request. */
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument
  allowedErrors: async ({}, use) => {
    await use([]);
  },
  app: async ({ page, allowedErrors }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });

    await page.clock.install({ time: new Date(START.getTime() - 10_000) });
    await page.goto('/');
    await page.clock.pauseAt(START);
    await expect(page.getByRole('heading', { name: 'Third Time' })).toBeVisible();

    await use(page);

    // A clean console is part of passing.
    const unexpected = errors.filter((e) => !allowedErrors.some((re) => re.test(e)));
    expect(unexpected, 'browser reported errors').toEqual([]);
  },
});

export { expect };

/**
 * Move time forward in one jump. The timer is derived from timestamps, not
 * counted tick by tick, so one tick after the jump shows the same figures as
 * thousands would, without the wait.
 */
export async function advance(page: Page, ms: number) {
  await page.clock.fastForward(ms);
}

export const MIN = 60_000;

export async function startState(page: Page, name: 'Focus' | 'Rest') {
  await page.getByRole('group', { name: 'Timer state' }).getByRole('button', { name, exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Timer state' }).getByRole('button', { name, exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
}

export async function addItem(page: Page, list: 'Should' | 'Want', text: string) {
  const input = page.getByRole('textbox', { name: `Add to ${list}` });
  await input.fill(text);
  await input.press('Enter');
  await expect(page.getByRole('checkbox', { name: text })).toBeVisible();
}

export async function openPractices(page: Page) {
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Practices', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Practices' })).toBeVisible();
}

export type Level = 'Paused' | 'Minimal' | 'Light' | 'Steady' | 'Serious';

/** Pick a level in the open practice editor. The buttons carry their target as a hint, so match the start of the name. */
export async function pickLevel(page: Page, level: Level) {
  await page.getByRole('group', { name: 'Level', exact: true }).getByRole('button', { name: new RegExp(`^${level}`) }).click();
}

/** Add a practice from the Practices tab, which must be open. */
export async function addPractice(page: Page, name: string, level?: Level) {
  await page.getByRole('button', { name: 'Add practice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add practice' });
  await dialog.getByLabel('Name').fill(name);
  if (level) await pickLevel(page, level);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Edit ${name}` })).toBeVisible();
}
