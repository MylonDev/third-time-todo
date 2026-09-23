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
 * A close stamp that leaves room for a two-hour gap on the same day. Anchored
 * to `Date.now()` instead, any run after 22:00 crossed midnight during the gap,
 * the settled stint was (correctly) archived into yesterday, and a test reading
 * today's entries found nothing there.
 */
function middayToday(): number {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
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
    const closedAt = middayToday();

    await seedClosedTimer(app, workedMs, closedAt);
    await app.clock.install();
    await app.clock.setSystemTime(new Date(closedAt + gapMs));
    await app.reload();

    await expect(app.getByRole('dialog')).toHaveAttribute('aria-label', 'Pick up your session');
    // Past the cutoff, Resume must not be offered — only Continue and Discard.
    await expect(app.getByRole('button', { name: /Resume/ })).toHaveCount(0);
    await app.getByRole('button', { name: /Continue/ }).click();
    await app.getByRole('button', { name: 'Stop' }).click();

    // The stint before the close is settled as its own entry and the picked-up
    // one starts fresh, so the honest reading is the day's work total.
    const s = await store(app);
    const loggedMs = s.daily.entries
      .filter((e: { kind: string }) => e.kind === 'work')
      .reduce((sum: number, e: { startedAt: number; endedAt: number }) => sum + (e.endedAt - e.startedAt), 0);
    expect(loggedMs, 'the closed-tab gap leaked into the ledger as active time').toBeLessThan(gapMs / 2);
    expect(loggedMs, 'the work actually done before closing was dropped').toBeGreaterThan(500);
  });

  // The close stamp is written on every `visibilitychange: hidden` while a
  // timer runs. Backgrounding the tab while the prompt is still up used to
  // restamp it to that moment, which is hours after the person actually left
  // — and then Continue would pick up from a close that never happened.
  test('backgrounding the tab while the prompt is up does not move the close stamp', async ({ app }) => {
    const workedMs = 1_500;
    const gapMs = 2 * 3_600_000;
    const closedAt = middayToday();

    await seedClosedTimer(app, workedMs, closedAt);
    await app.clock.install();
    await app.clock.setSystemTime(new Date(closedAt + gapMs));
    await app.reload();

    await expect(app.getByRole('dialog')).toHaveAttribute('aria-label', 'Pick up your session');
    await app.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await app.getByRole('button', { name: /Continue/ }).click();
    await app.getByRole('button', { name: 'Stop' }).click();

    const s = await store(app);
    const loggedMs = s.daily.entries
      .filter((e: { kind: string }) => e.kind === 'work')
      .reduce((sum: number, e: { startedAt: number; endedAt: number }) => sum + (e.endedAt - e.startedAt), 0);
    expect(loggedMs, 'the closed-tab gap leaked into the ledger as active time').toBeLessThan(gapMs / 2);
    expect(loggedMs, 'the work actually done before closing was dropped').toBeGreaterThan(500);
  });

  test('Continue logs actual rest taken on a break, not the time the tab was closed', async ({ app }) => {
    const restedMs = 1_500;
    const gapMs = 2 * 3_600_000;
    const closedAt = middayToday();

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

  test('a timer running across midnight is split once it stops', async ({ app }) => {
    await startWork(app);
    await app.waitForTimeout(2200);

    // Still working when the date turns over. Nothing archives yet — the
    // segment is still open, and mount/turnover aren't what's driving this.
    await setClockDaysAhead(app, 1);
    await app.waitForTimeout(1500);

    let s = await store(app);
    expect(s.history, 'archived while a timer was running').toEqual([]);

    await app.getByRole('button', { name: 'Stop' }).click();
    s = await store(app);
    expect(s.history.length, 'yesterday was not archived once the timer stopped').toBe(1);
    // The part of the stint that ran on the new day belongs to today, not
    // to whatever got archived under yesterday.
    expect(s.daily.entries.length, "today's half of the split stint is missing").toBe(1);
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

  test('a timer left running across the boundary does not stall the day', async ({ app }) => {
    // Seeded directly rather than starting a real timer and rewriting
    // localStorage underneath it: the live page's own `pagehide` handler
    // would re-persist its (unmodified) in-memory state over these edits
    // as soon as `reload()` navigates away, since that page never went
    // through the timer this state describes. See `seedClosedTimer` above
    // for the same caveat — the fixture leaves the page idle, so the
    // handler's `timerState !== 'idle'` guard skips it here.
    await app.evaluate(() => {
      localStorage.setItem(
        'tt-session',
        JSON.stringify({
          state: {
            daily: { date: '2020-01-01', entries: [] },
            history: [],
            timerState: 'working',
            timerStart: new Date('2020-01-01T23:00:00').getTime(),
            sessionClosedAt: null,
          },
          version: 4,
        })
      );
    });
    await app.reload();

    const state = await app.evaluate(() => JSON.parse(localStorage.getItem('tt-session')!).state);
    expect(state.daily.date).not.toBe('2020-01-01');
    expect(state.history.some((h: { date: string }) => h.date === '2020-01-01')).toBe(true);
  });
});

// Unfinished tasks used to be carried into the new day behind a triage modal.
// They now stay on the day they were planned for; the Overdue strip in
// today's column is how they come back (see schedule.spec.ts).
test.describe('a new day with unfinished tasks', () => {
  test('asks nothing, and leaves them where they were planned', async ({ app }) => {
    await addTask(app, 'Yesterday task');
    await startWork(app);
    await app.waitForTimeout(1200);
    await app.getByRole('button', { name: 'Stop' }).click();

    await setClockDaysAhead(app, 1);
    await app.reload();
    await expect(app.getByRole('dialog')).toHaveCount(0);
    await expect(app.getByTestId('overdue')).toContainText('Yesterday task');
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
