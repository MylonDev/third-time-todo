import type { Page } from '@playwright/test';
import { advance, expect, MIN, startState, test } from './helpers';

declare global {
  interface Window {
    __chimes: number;
    __notes: string[];
    __asked: number;
  }
}

/**
 * Stand-ins for the sound and the notification, so a test can count them. The
 * real ones need a speaker and a permission prompt. Installed before a reload,
 * since the fixture has already loaded the page.
 */
async function spyOnAlerts(page: Page, permission: 'granted' | 'default' = 'granted') {
  await page.addInitScript((permissionAtStart) => {
    window.__chimes = 0;
    window.__notes = [];
    window.__asked = 0;
    // Counting the constructor is enough: the tones it would play throw and are ignored.
    window.AudioContext = class {
      constructor() {
        window.__chimes += 1;
      }
    } as unknown as typeof AudioContext;
    let permission = permissionAtStart;
    window.Notification = class {
      static get permission() {
        return permission;
      }
      static async requestPermission() {
        window.__asked += 1;
        permission = 'granted';
        return permission;
      }
      constructor(title: string) {
        window.__notes.push(title);
      }
    } as unknown as typeof Notification;
  }, permission);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Third Time' })).toBeVisible();
}

const alerts = (page: Page) => page.evaluate(() => ({ chimes: window.__chimes, notes: window.__notes }));

async function startTimed(page: Page, length: string) {
  await page.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
  await page.getByRole('button', { name: length, exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText('Timed running')).toBeVisible();
}

test.describe('chimes and notifications', () => {
  test('a Timed session that runs out chimes and notifies once', async ({ app }) => {
    await spyOnAlerts(app);
    await startTimed(app, '10 min');
    await advance(app, 9 * MIN);
    expect(await alerts(app)).toEqual({ chimes: 0, notes: [] });

    await advance(app, MIN);
    await expect(app.getByText('Stopped')).toBeVisible();
    expect(await alerts(app)).toEqual({ chimes: 1, notes: ['Timed session done'] });

    await advance(app, 5 * MIN);
    expect(await alerts(app)).toEqual({ chimes: 1, notes: ['Timed session done'] });
  });

  test('stopping a Timed session early says nothing', async ({ app }) => {
    await spyOnAlerts(app);
    await startTimed(app, '10 min');
    await advance(app, 4 * MIN);
    await app.getByRole('button', { name: 'Stop' }).click();
    await advance(app, 20 * MIN);
    expect(await alerts(app)).toEqual({ chimes: 0, notes: [] });
  });

  test('a Timed session that ended long before the app came back is not announced', async ({ app }) => {
    await spyOnAlerts(app);
    await startTimed(app, '10 min');
    await app.reload();
    await advance(app, 40 * MIN);
    await expect(app.getByText('Stopped')).toBeVisible();
    expect(await alerts(app)).toEqual({ chimes: 0, notes: [] });
  });

  test('Rest running into debt chimes and notifies once', async ({ app }) => {
    await spyOnAlerts(app);
    await startState(app, 'Focus');
    await advance(app, 9 * MIN); // earns 3:00
    await startState(app, 'Rest');
    await advance(app, 3 * MIN);
    await expect(app.getByTestId('balance')).toHaveText('0:00');
    expect(await alerts(app)).toEqual({ chimes: 0, notes: [] });

    await advance(app, 30_000);
    await expect(app.getByText('Rest debt')).toBeVisible();
    expect(await alerts(app)).toEqual({ chimes: 1, notes: ['Rest is in debt'] });

    await advance(app, 5 * MIN);
    expect(await alerts(app)).toEqual({ chimes: 1, notes: ['Rest is in debt'] });
  });

  test('a crossing into debt that is long past is not announced', async ({ app }) => {
    await spyOnAlerts(app);
    await startState(app, 'Focus');
    await advance(app, 9 * MIN);
    await startState(app, 'Rest');
    // The phone was asleep for ten minutes: the line was crossed seven minutes ago.
    await advance(app, 10 * MIN);
    await expect(app.getByText('Rest debt')).toBeVisible();
    expect(await alerts(app)).toEqual({ chimes: 0, notes: [] });
  });

  test('Focus never announces a balance', async ({ app }) => {
    await spyOnAlerts(app);
    await startState(app, 'Focus');
    await advance(app, 30 * MIN);
    expect(await alerts(app)).toEqual({ chimes: 0, notes: [] });
  });

  test('with Sounds off, nothing is played or shown', async ({ app }) => {
    await spyOnAlerts(app);
    await app.getByRole('button', { name: 'Settings' }).click();
    await app.getByRole('checkbox', { name: /Sounds/ }).uncheck();
    await app.getByRole('button', { name: 'Done' }).click();

    await startTimed(app, '10 min');
    await advance(app, 10 * MIN);
    await expect(app.getByText('Stopped')).toBeVisible();
    await app.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Flow' }).click();
    await startState(app, 'Focus');
    await advance(app, 3 * MIN);
    await startState(app, 'Rest');
    await advance(app, 2 * MIN);
    await expect(app.getByText('Rest debt')).toBeVisible();
    expect(await alerts(app)).toEqual({ chimes: 0, notes: [] });
  });

  test('permission is asked from the Settings toggle, never on load', async ({ app }) => {
    await spyOnAlerts(app, 'default');
    await startTimed(app, '10 min');
    await advance(app, 10 * MIN);
    expect(await app.evaluate(() => window.__asked)).toBe(0);

    await app.getByRole('button', { name: 'Settings' }).click();
    const sounds = app.getByRole('checkbox', { name: /Sounds/ });
    await sounds.uncheck();
    expect(await app.evaluate(() => window.__asked)).toBe(0);
    await sounds.check();
    expect(await app.evaluate(() => window.__asked)).toBe(1);
  });

  test('Sounds is on for settings saved before it existed', async ({ app }) => {
    await app.evaluate(() => localStorage.setItem('tt2-settings', JSON.stringify({ state: { dayEndHour: 2, theme: 'dark' }, version: 2 })));
    await app.reload();
    await app.getByRole('button', { name: 'Settings' }).click();
    await expect(app.getByRole('checkbox', { name: /Sounds/ })).toBeChecked();
    // The rest of what was saved is kept.
    await expect(app.getByLabel('Day ends at')).toHaveValue('2');
  });
});
