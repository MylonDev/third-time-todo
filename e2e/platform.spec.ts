import type { Page } from '@playwright/test';
import { advance, expect, MIN, startState, test } from './helpers';

declare global {
  interface Window {
    __locks: { released: boolean }[];
    __refuse: boolean;
  }
}

/** A stand-in for the Wake Lock API, which headless Chromium won't grant. */
async function mockWakeLock(page: Page, { refuse = false } = {}) {
  await page.addInitScript((refuseRequests) => {
    window.__locks = [];
    window.__refuse = refuseRequests;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          if (window.__refuse) throw new DOMException('no', 'NotAllowedError');
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
    await setVisibility(app, 'hidden');
    await app.evaluate(() => (window.__locks[0] as unknown as { release: () => void }).release());
    await expect(app.getByTestId('screen-on')).toHaveCount(0);
    await setVisibility(app, 'visible');
    await expect(app.getByTestId('screen-on')).toBeVisible();
    expect(await app.evaluate(() => window.__locks.length)).toBe(2);
  });

  test('is taken again when the release lands after the page is visible', async ({ app }) => {
    await mockWakeLock(app);
    await app.reload();
    await app.clock.pauseAt(new Date(2026, 9, 12, 10, 0, 5));
    await startState(app, 'Should');
    await expect(app.getByTestId('screen-on')).toBeVisible();

    await setVisibility(app, 'hidden');
    await setVisibility(app, 'visible');
    // The old lock is only now released, after the page came back.
    await app.evaluate(() => (window.__locks[0] as unknown as { release: () => void }).release());
    await expect.poll(() => app.evaluate(() => window.__locks.length)).toBe(2);
    await expect(app.getByTestId('screen-on')).toBeVisible();
  });

  test('a refused lock is asked for again on the next tap', async ({ app }) => {
    await mockWakeLock(app, { refuse: true });
    await app.reload();
    await app.clock.pauseAt(new Date(2026, 9, 12, 10, 0, 5));
    await startState(app, 'Should');
    await expect(app.getByTestId('screen-on')).toHaveCount(0);

    await app.evaluate(() => (window.__refuse = false));
    await app.getByTestId('balance').click();
    await expect(app.getByTestId('screen-on')).toBeVisible();
    expect(await app.evaluate(() => window.__locks.length)).toBe(1);
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
