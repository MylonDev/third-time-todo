import type { Page } from '@playwright/test';
import { advance, expect, MIN, startState, test } from './helpers';

declare global {
  interface Window {
    __locks: { released: boolean }[];
    __badge: (number | null)[];
  }
}

/** A stand-in for the Wake Lock API, which headless Chromium won't grant. */
async function mockWakeLock(page: Page, { refuse = false } = {}) {
  await page.addInitScript((refuseRequests) => {
    window.__locks = [];
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          if (refuseRequests) throw new DOMException('no', 'NotAllowedError');
          const listeners: (() => void)[] = [];
          const lock = {
            released: false,
            addEventListener: (_: string, fn: () => void) => listeners.push(fn),
            release: async () => {
              if (lock.released) return;
              lock.released = true;
              listeners.forEach((fn) => fn());
            },
          };
          window.__locks.push(lock);
          return lock;
        },
      },
    });
  }, refuse);
}

/** Pretend the page was hidden, as it is when the phone locks or the app is left. */
async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test.describe('wake lock', () => {
  test('is taken when the timer starts and released when it stops', async ({ app }) => {
    await mockWakeLock(app);
    await app.reload();
    await app.clock.pauseAt(new Date(2026, 9, 12, 10, 0, 5));

    await expect(app.getByTestId('screen-on')).toHaveCount(0);
    await startState(app, 'Should');
    await expect(app.getByTestId('screen-on')).toBeVisible();
    expect(await app.evaluate(() => window.__locks.length)).toBe(1);

    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(app.getByTestId('screen-on')).toHaveCount(0);
    expect(await app.evaluate(() => window.__locks[0].released)).toBe(true);
  });

  test('is taken again when the page comes back after being hidden', async ({ app }) => {
    await mockWakeLock(app);
    await app.reload();
    await app.clock.pauseAt(new Date(2026, 9, 12, 10, 0, 5));
    await startState(app, 'Want');
    await expect(app.getByTestId('screen-on')).toBeVisible();

    // The browser releases it when hidden.
    await app.evaluate(() => window.__locks[0].released === false && (window.__locks[0] as unknown as { release: () => void }).release());
    await expect(app.getByTestId('screen-on')).toHaveCount(0);
    await setVisibility(app, 'visible');
    await expect(app.getByTestId('screen-on')).toBeVisible();
    expect(await app.evaluate(() => window.__locks.length)).toBe(2);
  });

  test('a refused lock leaves a working timer and no error', async ({ app }) => {
    await mockWakeLock(app, { refuse: true });
    await app.reload();
    await app.clock.pauseAt(new Date(2026, 9, 12, 10, 0, 5));
    await startState(app, 'Should');
    await advance(app, 3 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('1:00');
    await expect(app.getByTestId('screen-on')).toHaveCount(0);
  });

  test('can be switched off in settings', async ({ app }) => {
    await mockWakeLock(app);
    await app.reload();
    await app.clock.pauseAt(new Date(2026, 9, 12, 10, 0, 5));
    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByLabel('Keep screen on while timing').uncheck();
    await app.getByRole('button', { name: 'Done' }).click();
    await startState(app, 'Should');
    await expect(app.getByTestId('screen-on')).toHaveCount(0);
    expect(await app.evaluate(() => window.__locks.length)).toBe(0);
  });
});

test.describe('app icon badge', () => {
  test('shows whole minutes of Want available once switched on', async ({ app, context }) => {
    await context.grantPermissions(['notifications']);
    await app.addInitScript(() => {
      window.__badge = [];
      Object.defineProperty(navigator, 'setAppBadge', {
        configurable: true,
        value: async (n: number) => void window.__badge.push(n),
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        configurable: true,
        value: async () => void window.__badge.push(null),
      });
    });
    await app.reload();
    await app.clock.pauseAt(new Date(2026, 9, 12, 10, 0, 5));

    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByLabel('Show Want available on the app icon').check();
    await app.getByRole('button', { name: 'Done' }).click();

    await startState(app, 'Should');
    await advance(app, 30 * MIN); // earns 10 minutes
    await expect.poll(() => app.evaluate(() => window.__badge.at(-1))).toBe(10);

    await startState(app, 'Want');
    await advance(app, 15 * MIN); // 10 - 15 = debt
    await expect.poll(() => app.evaluate(() => window.__badge.at(-1))).toBeNull();
  });
});

test.describe('resuming and other windows', () => {
  test('catches up straight away when the page becomes visible again', async ({ app }) => {
    await startState(app, 'Should');
    await advance(app, 3 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('1:00');

    // Move time without letting any interval fire, as a suspended page would see it.
    await app.clock.setSystemTime(new Date(2026, 9, 12, 10, 12, 0));
    await expect(app.getByTestId('balance')).toHaveText('1:00');
    await setVisibility(app, 'visible');
    await expect(app.getByTestId('balance')).toHaveText('4:00');
  });

  test('a second window follows the first', async ({ app }) => {
    const other = await app.context().newPage();
    await other.goto('/');
    await expect(other.getByText('Resting')).toBeVisible();

    await startState(app, 'Want');
    await expect(other.getByText('Want running')).toBeVisible();

    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(other.getByText('Resting')).toBeVisible();
  });

  test('the install hint stays away outside iOS Safari', async ({ app }) => {
    await expect(app.getByRole('note')).toHaveCount(0);
  });
});
