import { expect, type Page, test as base } from '@playwright/test';

/** Monday 12 Oct 2026, 10:00 local. Every spec starts here with the clock paused. */
export const START = new Date(2026, 9, 12, 10, 0, 0);

/**
 * Each test gets a fresh browser context, so localStorage starts empty. The
 * clock is fake and paused: time moves only when a test says so, which makes
 * every figure on the timer exact.
 */
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
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
    expect(errors, 'browser reported errors').toEqual([]);
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

export async function startState(page: Page, name: 'Should' | 'Want') {
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
