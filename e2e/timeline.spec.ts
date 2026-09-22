import { test, expect, switchTab, startWork } from './helpers';
import type { Page } from '@playwright/test';

const HOUR = 3_600_000;
const MIN = 60_000;

interface SeedEntry {
  id: string;
  kind: 'work' | 'break';
  start: string; // "HH:MM" today (or on `daysAgo`)
  end: string;
  projectId?: string;
}

/**
 * Pin the clock to 18:00 today and seed the ledger. A fixed afternoon keeps
 * every seeded block safely inside the day, whatever time the suite runs.
 */
async function seed(page: Page, opts: { today?: SeedEntry[]; yesterday?: SeedEntry[] }) {
  const evening = new Date();
  evening.setHours(18, 0, 0, 0);
  await page.clock.install({ time: evening });
  await page.reload();
  await page.evaluate(
    ({ today, yesterday }) => {
      const k = (d: Date) =>
        [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      const on = (daysAgo: number, hhmm: string) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const [h, m] = hhmm.split(':').map(Number);
        d.setHours(h, m, 0, 0);
        return d.getTime();
      };
      const entries = (list: SeedEntry[], daysAgo: number) =>
        list.map((e) => ({
          id: e.id, kind: e.kind, mode: 'third', projectId: e.projectId,
          startedAt: on(daysAgo, e.start), endedAt: on(daysAgo, e.end),
        }));
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yEntries = entries(yesterday, 1);
      const sum = (kind: string) =>
        yEntries.filter((e) => e.kind === kind).reduce((a, e) => a + e.endedAt - e.startedAt, 0);
      localStorage.setItem('tt-goals', JSON.stringify({
        state: { projects: [
          { id: 'p1', name: 'Thesis', color: '#5b8def', createdAt: 0, order: 0, progress: { time: {} }, total: { time: 0 } },
          { id: 'p2', name: 'Garden', createdAt: 0, order: 1, progress: { time: {} }, total: { time: 0 } },
        ] },
        version: 5,
      }));
      localStorage.setItem('tt-session', JSON.stringify({
        state: {
          daily: { date: k(new Date()), entries: entries(today, 0) },
          history: yEntries.length
            ? [{ date: k(y), totalWorkMs: sum('work'), totalBreakMs: sum('break'), unusedRestMs: 0, entries: yEntries }]
            : [],
          timerState: 'idle', timerStart: null, sessionClosedAt: null,
        },
        version: 4,
      }));
    },
    { today: opts.today ?? [], yesterday: opts.yesterday ?? [] }
  );
  await page.reload();
  await switchTab(page, 'Activity');
}

async function stored(page: Page) {
  return page.evaluate(() => ({
    session: JSON.parse(localStorage.getItem('tt-session')!).state,
    projects: JSON.parse(localStorage.getItem('tt-goals')!).state.projects,
  }));
}

const blocks = (page: Page) => page.getByTestId('timeline-block');

async function editBlock(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('the day timeline', () => {
  test('draws one block per entry, in wall-clock order', async ({ app }) => {
    await seed(app, {
      today: [
        { id: 'c', kind: 'work', start: '14:00', end: '15:00' },
        { id: 'a', kind: 'work', start: '09:00', end: '10:30' },
        { id: 'b', kind: 'break', start: '10:30', end: '10:50' },
      ],
    });
    await expect(blocks(app)).toHaveCount(3);
    const tops = await blocks(app).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(await blocks(app).evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))).toEqual([
      'work', 'break', 'work',
    ]);
  });

  test('trimming a work block lowers the bank by the rest it had earned', async ({ app }) => {
    await seed(app, { today: [{ id: 'a', kind: 'work', start: '09:00', end: '12:00', projectId: 'p1' }] });
    await expect(app.getByTestId('bank-balance')).toContainText('1:00:00');

    await editBlock(app, /^Active block/);
    await app.getByLabel('End').fill('10:30');
    await app.getByRole('button', { name: 'Save' }).click();

    await expect(app.getByRole('dialog')).toHaveCount(0);
    await expect(app.getByTestId('bank-balance')).toContainText('30:00');
  });

  test('the same trim lowers the project’s progress', async ({ app }) => {
    await seed(app, { today: [{ id: 'a', kind: 'work', start: '09:00', end: '12:00', projectId: 'p1' }] });
    await editBlock(app, /^Active block/);
    await app.getByLabel('End').fill('10:00');
    await app.getByRole('button', { name: 'Save' }).click();
    await expect(app.getByRole('dialog')).toHaveCount(0);
    const { projects } = await stored(app);
    expect(projects[0].total.time).toBe(HOUR);
  });

  test('editing an archived day re-sums its totals', async ({ app }) => {
    await seed(app, { yesterday: [{ id: 'y', kind: 'work', start: '09:00', end: '13:00' }] });
    // Yesterday is the second-to-last column.
    const cols = app.locator('main').getByRole('button', { name: /active$/ });
    await cols.nth(12).click();
    await editBlock(app, /^Active block/);
    await app.getByLabel('End').fill('11:00');
    await app.getByRole('button', { name: 'Save' }).click();
    await expect(app.getByRole('dialog')).toHaveCount(0);
    const { session } = await stored(app);
    expect(session.history[0].totalWorkMs).toBe(2 * HOUR);
  });

  test('refuses an edit that would overlap a neighbour', async ({ app }) => {
    await seed(app, {
      today: [
        { id: 'a', kind: 'work', start: '09:00', end: '10:00' },
        { id: 'b', kind: 'break', start: '10:00', end: '10:15' },
      ],
    });
    await editBlock(app, /^Active block/);
    await app.getByLabel('End').fill('10:10');
    await app.getByRole('button', { name: 'Save' }).click();
    await expect(app.getByRole('alert')).toContainText('overlaps');
    await expect(app.getByRole('dialog')).toBeVisible();
    const { session } = await stored(app);
    expect(session.daily.entries[0].endedAt - session.daily.entries[0].startedAt).toBe(HOUR);
  });

  test('a block added by hand earns rest', async ({ app }) => {
    await seed(app, {});
    await expect(app.getByTestId('bank-balance')).toContainText('0:00');
    await app.getByRole('button', { name: '+ Add block' }).click();
    await app.getByLabel('Start').fill('14:00');
    await app.getByLabel('End').fill('15:30');
    await app.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(blocks(app)).toHaveCount(1);
    await expect(app.getByTestId('bank-balance')).toContainText('30:00');
  });

  test('dragging on empty rail opens a block for that stretch', async ({ app }) => {
    await seed(app, { today: [{ id: 'a', kind: 'work', start: '09:00', end: '10:00' }] });
    const rail = app.getByRole('group', { name: /Day timeline/ });
    await rail.scrollIntoViewIfNeeded();
    const box = (await rail.boundingBox())!;
    // The view opens an hour before the first block — empty rail to drag on.
    await app.mouse.move(box.x + box.width / 2, box.y + 8);
    await app.mouse.down();
    await app.mouse.move(box.x + box.width / 2, box.y + 36, { steps: 4 });
    await app.mouse.up();
    await expect(app.getByRole('dialog', { name: 'Add a block' })).toBeVisible();
    await app.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(blocks(app)).toHaveCount(2);
  });

  test('reassigning a block moves its time to the other project', async ({ app }) => {
    await seed(app, { today: [{ id: 'a', kind: 'work', start: '09:00', end: '10:00', projectId: 'p1' }] });
    await editBlock(app, /^Active block/);
    await app.getByLabel('Project').selectOption({ label: 'Garden' });
    await app.getByRole('button', { name: 'Save' }).click();
    await expect(app.getByRole('dialog')).toHaveCount(0);
    const { projects } = await stored(app);
    expect(projects.find((p: { id: string }) => p.id === 'p1').total.time).toBe(0);
    expect(projects.find((p: { id: string }) => p.id === 'p2').total.time).toBe(HOUR);
  });

  test('split cuts a block in two', async ({ app }) => {
    await seed(app, { today: [{ id: 'a', kind: 'work', start: '09:00', end: '11:00', projectId: 'p1' }] });
    await editBlock(app, /^Active block/);
    await app.getByLabel('Split at').fill('10:00');
    await app.getByRole('button', { name: 'Split' }).click();
    await expect(blocks(app)).toHaveCount(2);
  });

  test('the running entry grows on the shared clock', async ({ app }) => {
    await seed(app, {});
    await startWork(app);
    const live = app.getByTestId('live-block');
    await expect(live).toBeVisible();
    const before = (await live.boundingBox())!.height;
    await app.clock.runFor(30 * MIN);
    await expect.poll(async () => (await live.boundingBox())!.height).toBeGreaterThan(before + 10);
  });
});
