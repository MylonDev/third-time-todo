import { test, expect, addTask, startWork } from './helpers';
import type { Page } from '@playwright/test';

/** Read the persisted session store straight out of localStorage. */
async function store(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('tt-session');
    return raw ? JSON.parse(raw).state : null;
  });
}

/**
 * Move the whole app to a later date. `todayKey()` reads the system clock, so
 * shifting the clock is how a day rollover gets exercised.
 */
async function setClockDaysAhead(page: Page, days: number) {
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + days * 86_400_000));
}

test('there is no session ceremony', async ({ app }) => {
  await startWork(app);
  await expect(app.getByRole('button', { name: 'End Session' })).toHaveCount(0);
});

test('the bank is rebuilt from the ledger after a reload', async ({ app }) => {
  await startWork(app);
  await app.waitForTimeout(2500);
  await app.getByRole('button', { name: 'Stop' }).click();
  const before = await app.getByTestId('bank-balance').textContent();
  await app.reload();
  await expect(app.getByTestId('bank-balance')).toHaveText(before!);
});

test('the bank advances while working', async ({ app }) => {
  await startWork(app);
  const first = await app.getByTestId('bank-balance').textContent();
  await app.waitForTimeout(4000);
  expect(await app.getByTestId('bank-balance').textContent()).not.toBe(first);
});

test.describe('restoring a timer that survived a reload', () => {
  /** YYYY-MM-DD for a Date, in local time — matches `dateKey` in thirdTime.ts. */
  const k = (d: Date) =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');

  /**
   * Seed a `working` timer that was closed a real amount of time ago, without
   * ever running it through this page's own `pagehide` handler — that handler
   * would stamp `sessionClosedAt` at reload time (whatever the clock says
   * then), overwriting exactly the value this test needs to hold constant.
   * Seeding `localStorage` directly and reloading a page that is still idle
   * (its `pagehide` guard skips a timer that isn't running) sidesteps that.
   */
  async function seedClosedTimer(page: Page, workedMs: number, closedAt: number) {
    await page.evaluate(
      ({ workedMs, closedAt, date }) => {
        localStorage.setItem(
          'tt-session',
          JSON.stringify({
            state: {
              daily: { date, entries: [] },
              history: [],
              timerState: 'working',
              timerStart: closedAt - workedMs,
              sessionClosedAt: closedAt,
            },
            version: 4,
          })
        );
      },
      { workedMs, closedAt, date: k(new Date(closedAt)) }
    );
  }

  test('Continue logs the time actually worked, not the time the tab was closed', async ({ app }) => {
    const workedMs = 1_500;
    const gapMs = 2 * 3_600_000; // two hours with the tab closed — well past the 30-minute Resume cutoff
    const closedAt = Date.now();

    await seedClosedTimer(app, workedMs, closedAt);
    await app.clock.install();
    await app.clock.setSystemTime(new Date(closedAt + gapMs));
    await app.reload();

    await expect(app.getByRole('dialog')).toHaveAttribute('aria-label', 'Pick up your session');
    // Past the cutoff, Resume must not be offered — only Continue and Discard.
    await expect(app.getByRole('button', { name: /Resume/ })).toHaveCount(0);
    await app.getByRole('button', { name: /Continue/ }).click();
    await app.getByRole('button', { name: 'Stop' }).click();

    const s = await store(app);
    const entry = s.daily.entries[s.daily.entries.length - 1];
    const loggedMs = entry.endedAt - entry.startedAt;
    expect(loggedMs, 'the closed-tab gap leaked into the ledger as active time').toBeLessThan(gapMs / 2);
    expect(loggedMs, 'the work actually done before closing was dropped').toBeGreaterThan(500);
  });

  test('Continue logs actual rest taken on a break, not the time the tab was closed', async ({ app }) => {
    const restedMs = 1_500;
    const gapMs = 2 * 3_600_000;
    const closedAt = Date.now();

    await app.evaluate(
      ({ restedMs, closedAt, date }) => {
        localStorage.setItem(
          'tt-session',
          JSON.stringify({
            state: {
              daily: { date, entries: [] },
              history: [],
              timerState: 'on-break',
              timerStart: closedAt - restedMs,
              sessionClosedAt: closedAt,
            },
            version: 4,
          })
        );
      },
      { restedMs, closedAt, date: k(new Date(closedAt)) }
    );
    await app.clock.install();
    await app.clock.setSystemTime(new Date(closedAt + gapMs));
    await app.reload();

    await expect(app.getByRole('dialog')).toHaveAttribute('aria-label', 'Pick up your session');
    await app.getByRole('button', { name: /Continue/ }).click();
    // No dedicated Stop-from-break assertion here — Resume then Stop exercises
    // the same `stopBreak` write this test cares about.
    await app.getByRole('button', { name: 'Resume' }).click();
    await app.getByRole('button', { name: 'Stop' }).click();

    const s = await store(app);
    const restEntry = s.daily.entries.find((e: { kind: string }) => e.kind === 'break');
    const loggedMs = restEntry.endedAt - restEntry.startedAt;
    expect(loggedMs, 'the closed-tab gap leaked into the ledger as rest taken').toBeLessThan(gapMs / 2);
    expect(loggedMs, 'the rest actually taken before closing was dropped').toBeGreaterThan(500);
  });
});

test.describe('the day ends by itself', () => {
  test('a finished day is archived on the next open, exactly once', async ({ app }) => {
    await startWork(app);
    await app.waitForTimeout(2200);
    await app.getByRole('button', { name: 'Stop' }).click();

    await setClockDaysAhead(app, 1);
    await app.reload();
    await expect(app.getByRole('heading', { name: 'Third Time' })).toBeVisible();

    let s = await store(app);
    expect(s.history.length, 'yesterday was not archived').toBe(1);
    expect(s.daily.entries, 'today did not start clean').toEqual([]);

    await app.reload();
    s = await store(app);
    expect(s.history.length, 'archived twice').toBe(1);
  });

  test('a timer running across midnight is not split', async ({ app }) => {
    await startWork(app);
    await app.waitForTimeout(2200);

    // Still working when the date turns over.
    await setClockDaysAhead(app, 1);
    await app.waitForTimeout(1500);

    let s = await store(app);
    expect(s.history, 'archived while a timer was running').toEqual([]);

    await app.getByRole('button', { name: 'Stop' }).click();
    s = await store(app);
    expect(s.history.length, 'not archived once the timer stopped').toBe(1);
  });

  test('work before midnight survives a stint that ends after it', async ({ app }) => {
    // One completed entry, so the day already holds a stint.
    await startWork(app);
    await app.waitForTimeout(2200);
    await app.getByRole('button', { name: 'Stop' }).click();
    const before = await store(app);
    expect(before.daily.entries.length).toBe(1);

    // A second stint that is still running when the date turns over.
    await startWork(app);
    await app.waitForTimeout(2200);
    await setClockDaysAhead(app, 1);
    await app.waitForTimeout(1200);
    await app.getByRole('button', { name: 'Stop' }).click();

    // The defect this replaces: stopWork and stopBreak reset the day whenever
    // the date had changed, discarding every earlier entry unarchived.
    const after = await store(app);
    expect(after.history.length, 'the day was not archived').toBe(1);
    expect(after.history[0].entries.length, 'the earlier stint was discarded').toBe(2);
  });
});

test.describe('tasks carried over', () => {
  test('are triaged on the new day, not by ending a timer', async ({ app }) => {
    await addTask(app, 'Yesterday task');
    await startWork(app);
    await app.waitForTimeout(1200);

    // Stopping the timer must not ask the day-scoped question.
    await app.getByRole('button', { name: 'Stop' }).click();
    await expect(app.getByText('came with you')).toBeHidden();

    await setClockDaysAhead(app, 1);
    await app.reload();
    await expect(app.getByText('came with you')).toBeVisible();
    await expect(app.getByRole('dialog')).toHaveAttribute('aria-label', 'Tasks carried over');
  });

  test('dismissing keeps them, and it does not ask twice', async ({ app }) => {
    await addTask(app, 'Yesterday task');
    await setClockDaysAhead(app, 1);
    await app.reload();

    await expect(app.getByRole('dialog')).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(app.getByRole('checkbox', { name: 'Yesterday task' })).toBeVisible();

    await app.reload();
    await expect(app.getByRole('dialog'), 'asked again on the same day').toBeHidden();
    await expect(app.getByRole('checkbox', { name: 'Yesterday task' })).toBeVisible();
  });

  test('Discard drops the task', async ({ app }) => {
    await addTask(app, 'Yesterday task');
    await setClockDaysAhead(app, 1);
    await app.reload();

    await app.getByRole('button', { name: 'Discard' }).click();
    await app.getByRole('button', { name: 'Start the day' }).click();
    await expect(app.getByRole('checkbox', { name: 'Yesterday task' })).toBeHidden();
  });
});

test.describe('modes', () => {
  const MODES = [
    ['half', 'Relaxed', '1:2'],
    ['third', 'Serious', '1:3'],
    ['quarter', 'Locked in', '1:4'],
  ] as const;

  test('are named by intent and keep their ratios', async ({ app }) => {
    for (const [, label, ratio] of MODES) {
      await expect(
        app.getByRole('button', { name: new RegExp(label) }),
        `${label} is missing or no longer ${ratio}`
      ).toContainText(ratio);
    }
  });

  test('the stored keys are untouched by the renaming', async ({ app }) => {
    // Every archived TimeEntry.mode and the saved setting hold these keys.
    // Renaming what you read must not rename what is written.
    for (const [key, label] of MODES) {
      await app.evaluate((k) => {
        const raw = JSON.parse(localStorage.getItem('tt-settings') ?? '{"state":{},"version":8}');
        raw.state.mode = k;
        localStorage.setItem('tt-settings', JSON.stringify(raw));
      }, key);
      await app.reload();
      await expect(
        app.getByRole('button', { name: new RegExp(label) }),
        `stored mode "${key}" no longer selects ${label}`
      ).toHaveAttribute('aria-pressed', 'true');
    }
  });
});

test.describe('removals', () => {
  test('no estimate field on a task', async ({ app }) => {
    await expect(app.getByPlaceholder('min')).toBeHidden();
    await addTask(app, 'Alpha');
    await app.getByRole('button', { name: 'Task actions' }).first().click();
    await app.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(app.getByPlaceholder('Est. min')).toBeHidden();
  });

});
