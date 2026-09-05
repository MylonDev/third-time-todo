import { test, expect, addTask, startSession, readTimers } from './helpers';

test.describe('the shared clock', () => {
  test('the session timer advances', async ({ app }) => {
    await startSession(app);
    const before = await readTimers(app);
    expect(before.length, 'expected timer digits on the page').toBeGreaterThan(0);
    await expect
      .poll(() => readTimers(app), { timeout: 5000 })
      .not.toEqual(before);
  });

  test('every panel advances off the same tick', async ({ app }) => {
    await startSession(app);

    // Sample faster than the clock, then look for a sample where some running
    // figures moved and others didn't. Independent intervals — which is what
    // this app used to have, six of them — drift apart and produce those.
    const samples: string[][] = [];
    for (let i = 0; i < 16; i++) {
      samples.push(await readTimers(app));
      await app.waitForTimeout(250);
    }

    let splitTicks = 0;
    for (let i = 1; i < samples.length; i++) {
      const [prev, cur] = [samples[i - 1], samples[i]];
      if (prev.length !== cur.length) continue;
      const moved = prev.filter((v, j) => v !== cur[j]).length;
      // Not every figure changes every second — the bank moves at the mode's
      // ratio — so only a *partial* change among figures that do move is
      // evidence of drift. Allow a couple for sampling jitter.
      if (moved > 0 && moved < prev.length) splitTicks++;
    }
    expect(splitTicks, 'panels advancing out of phase').toBeLessThanOrEqual(3);
  });

  test('only one interval runs, however many rows are on screen', async ({ app }) => {
    let created = 0;
    await app.exposeFunction('__countInterval', () => { created++; });
    await app.addInitScript(() => {
      const original = window.setInterval;
      // @ts-expect-error patching for the assertion below
      window.setInterval = (...args) => {
        (window as unknown as { __countInterval: () => void }).__countInterval();
        return original.apply(window, args as Parameters<typeof setInterval>);
      };
    });
    await app.reload();

    for (const t of ['One', 'Two', 'Three']) await addTask(app, t);
    await startSession(app);
    await app.getByRole('checkbox', { name: 'One' }).locator('..').click();
    await app.waitForTimeout(2500);

    expect(created, `${created} intervals created`).toBeLessThanOrEqual(2);
  });
});

test.describe('focused time', () => {
  test('accrues while focused, stops when unfocused, survives a reload', async ({ app }) => {
    await addTask(app, 'Write the spec');
    await startSession(app);
    const row = app.locator('li').filter({ hasText: 'Write the spec' }).first();

    await row.click();
    await expect(row).toContainText('Tracked', { timeout: 5000 });

    const ticking = await row.innerText();
    await expect.poll(() => row.innerText(), { timeout: 5000 }).not.toEqual(ticking);

    await row.click(); // unfocus
    await app.waitForTimeout(300);
    const parked = await row.innerText();
    await app.waitForTimeout(2500);
    expect(await row.innerText(), 'kept accruing after unfocus').toEqual(parked);

    const tracked = (await row.innerText()).split('\n').find((l) => /Tracked/.test(l));
    await app.reload();
    const after = app.locator('li').filter({ hasText: 'Write the spec' }).first();
    expect((await after.innerText()).split('\n').find((l) => /Tracked/.test(l))).toEqual(tracked);
  });
});
