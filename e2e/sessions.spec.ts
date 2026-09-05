import { test, expect, addTask, startSession } from './helpers';
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

const endSession = async (page: Page) => {
  await page.getByRole('button', { name: 'End Session' }).click();
  await page.getByRole('button', { name: 'End the Session' }).click();
  await expect(page.getByText('Session complete')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
};

test.describe('ending a session', () => {
  test('clears the bank but does not archive the day', async ({ app }) => {
    await startSession(app);
    await app.waitForTimeout(2200);
    await endSession(app);

    const s = await store(app);
    expect(s.daily.bankMs, 'bank not cleared').toBe(0);
    expect(s.daily.sessionStartedAt ?? null, 'session left open').toBeNull();
    expect(s.history, 'the day was archived by End Session').toEqual([]);
    expect(s.daily.sessions.length, 'the stint was lost').toBeGreaterThan(0);
  });

  test('a second session adds to the day rather than replacing it', async ({ app }) => {
    // The second session is deliberately much shorter than the first. If the
    // day's unused rest were overwritten rather than accumulated, the total
    // would go *down* here — with two equal sessions it would not, and the
    // assertion would pass against the bug.
    await startSession(app);
    await app.waitForTimeout(4000);
    await endSession(app);
    const first = await store(app);
    expect(first.daily.unusedRestMs).toBeGreaterThan(0);

    await startSession(app);
    await app.waitForTimeout(1000);
    await endSession(app);
    const second = await store(app);

    expect(second.daily.sessions.length).toBeGreaterThan(first.daily.sessions.length);
    expect(second.daily.unusedRestMs, "the day's unused rest was overwritten")
      .toBeGreaterThan(first.daily.unusedRestMs);
  });

  test('the summary reports the session, with the day underneath', async ({ app }) => {
    await startSession(app);
    await app.waitForTimeout(2200);
    await endSession(app);

    await startSession(app);
    await app.waitForTimeout(2200);
    await app.getByRole('button', { name: 'End Session' }).click();
    await app.getByRole('button', { name: 'End the Session' }).click();
    await expect(app.getByText('Today so far:')).toBeVisible();
  });

  test('the confirm step does not warn in the debt colour', async ({ app }) => {
    await startSession(app);
    await app.waitForTimeout(2200);
    await app.getByRole('button', { name: 'End Session' }).click();

    const debt = await app.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-debt').trim()
    );
    const reds = await app.getByRole('dialog').evaluate((d, want) =>
      [...d.querySelectorAll<HTMLElement>('p')]
        .filter((e) => (e.getAttribute('style') ?? '').includes(want))
        .map((e) => e.textContent),
      debt
    );
    expect(reds, 'end-of-session copy still painted as a loss').toEqual([]);
  });
});

test('resetting from the restore prompt closes the abandoned session', async ({ app }) => {
  await startSession(app);
  await app.waitForTimeout(1500);
  expect((await store(app)).daily.sessionStartedAt, 'no session was opened').toBeTruthy();

  // Come back to a session that was still running when the page went away.
  await app.reload();
  await expect(app.getByRole('dialog')).toHaveAttribute('aria-label', 'Pick up your session');
  await app.getByRole('button', { name: /Reset/ }).click();
  await app.waitForTimeout(300);

  // Left open, the next session's summary would cover this one's stints too.
  expect((await store(app)).daily.sessionStartedAt ?? null,
    'the abandoned session is still open').toBeNull();
});

test.describe('the day ends by itself', () => {
  test('a finished day is archived on the next open, exactly once', async ({ app }) => {
    await startSession(app);
    await app.waitForTimeout(2200);
    await endSession(app);

    await setClockDaysAhead(app, 1);
    await app.reload();
    await expect(app.getByRole('heading', { name: 'Third Time' })).toBeVisible();

    let s = await store(app);
    expect(s.history.length, 'yesterday was not archived').toBe(1);
    expect(s.daily.sessions, 'today did not start clean').toEqual([]);

    await app.reload();
    s = await store(app);
    expect(s.history.length, 'archived twice').toBe(1);
  });

  test('a session running across midnight is not split', async ({ app }) => {
    await startSession(app);
    await app.waitForTimeout(2200);

    // Still working when the date turns over.
    await setClockDaysAhead(app, 1);
    await app.waitForTimeout(1500);

    let s = await store(app);
    expect(s.history, 'archived while a session was running').toEqual([]);

    await endSession(app);
    s = await store(app);
    expect(s.history.length, 'not archived once the session ended').toBe(1);
  });

  test('work before midnight survives a stint that ends after it', async ({ app }) => {
    // One completed session, so the day already holds a stint.
    await startSession(app);
    await app.waitForTimeout(2200);
    await endSession(app);
    const before = await store(app);
    expect(before.daily.sessions.length).toBe(1);

    // A second session that is still running when the date turns over.
    await startSession(app);
    await app.waitForTimeout(2200);
    await setClockDaysAhead(app, 1);
    await app.waitForTimeout(1200);
    await endSession(app);

    // The defect this replaces: stopWork and stopBreak reset the day whenever
    // the date had changed, discarding every earlier stint unarchived.
    const after = await store(app);
    expect(after.history.length, 'the day was not archived').toBe(1);
    expect(after.history[0].sessions.length, "the earlier stint was discarded").toBe(2);
  });
});

test.describe('tasks carried over', () => {
  test('are triaged on the new day, not at the end of a session', async ({ app }) => {
    await addTask(app, 'Yesterday task');
    await startSession(app);
    await app.waitForTimeout(1200);

    // Ending a session must not ask the day-scoped question.
    await app.getByRole('button', { name: 'End Session' }).click();
    await app.getByRole('button', { name: 'End the Session' }).click();
    await expect(app.getByText('came with you')).toBeHidden();
    await app.getByRole('button', { name: 'Done' }).click();

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
    // Every archived SessionLog.mode and the saved setting hold these keys.
    // Renaming what you read must not rename what is written.
    for (const [key, label] of MODES) {
      await app.evaluate((k) => {
        const raw = JSON.parse(localStorage.getItem('tt-settings') ?? '{"state":{},"version":7}');
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

  test('no deadline field on a goal', async ({ app }) => {
    await app.getByRole('button', { name: '+ Add Goal' }).click();
    await expect(app.getByText('Deadline')).toBeHidden();
    await expect(app.locator('input[type="date"]')).toHaveCount(0);
  });

  test('no streak on routine adherence', async ({ app }) => {
    // Needs a routine with a step, or the adherence view renders nothing and
    // the assertion holds for the wrong reason.
    await app.getByRole('button', { name: 'Manage' }).click();
    const newRoutine = app.getByPlaceholder('New routine name…');
    await newRoutine.fill('Morning');
    await newRoutine.press('Enter');
    const step = app.getByPlaceholder(/Add a step/);
    await step.fill('Take medication');
    await step.press('Enter');
    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog')).toBeHidden();

    // It is a tab, not a button, and it renders uppercase via CSS — so its
    // accessible name is "Routines".
    const adherence = app.locator('section').filter({
      has: app.getByRole('heading', { name: 'Activity', exact: true }),
    });
    await adherence.getByRole('tab', { name: 'Routines' }).click();
    await expect(adherence).toContainText('Morning');
    await expect(adherence, 'streak is back').not.toContainText('in a row');
  });
});
