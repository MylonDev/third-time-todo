import { test, expect, addTask, openTaskMenu } from './helpers';
import type { Page } from '@playwright/test';

// Wednesday 23 September 2026, midday. Monday of that week is the 21st.
const WEDNESDAY = new Date(2026, 8, 23, 12, 0, 0);

async function pinClock(page: Page, tasks: object[] = [], recurring: object[] = [], projects: object[] = []) {
  await page.clock.install({ time: WEDNESDAY });
  await page.evaluate(
    ({ tasks, recurring, projects }) => {
      localStorage.setItem('tt-tasks', JSON.stringify({
        state: { tasks, recurring, routines: [], routineHistory: {} }, version: 9,
      }));
      localStorage.setItem('tt-goals', JSON.stringify({ state: { projects }, version: 5 }));
    },
    { tasks, recurring, projects }
  );
  await page.reload();
}

function task(id: string, title: string, scheduledDate: string, extra: object = {}) {
  return {
    id, title, status: 'todo', createdAt: WEDNESDAY.getTime(), scheduledDate,
    order: 0, subtasks: [], trackedMs: 0, ...extra,
  };
}

const days = (page: Page) =>
  page.getByTestId('schedule').locator('section').evaluateAll((els) => els.map((e) => e.getAttribute('data-day')));

const column = (page: Page, day: string) => page.locator(`section[data-day="${day}"]`);

test.describe('the weekly schedule', () => {
  test('This week runs Monday to Sunday; Rolling starts today', async ({ app }) => {
    await pinClock(app);
    expect(await days(app)).toEqual([
      '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
    ]);
    await app.getByRole('radio', { name: 'This week' }).click();
    expect(await days(app)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
    ]);
  });

  test('a Mon/Wed rule draws its occurrences in future columns only on those days', async ({ app }) => {
    await pinClock(app);
    await app.getByPlaceholder('Add a task…').fill('Gym');
    await app.getByLabel('Repeat').selectOption('weekdays');
    // Default Mon–Fri; leave only Mon and Wed.
    for (const d of ['Tue', 'Thu', 'Fri']) await app.getByRole('button', { name: d, exact: true }).click();
    await app.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(column(app, '2026-09-23').getByTestId('occurrence')).toHaveCount(1); // Wed
    await expect(column(app, '2026-09-28').getByTestId('occurrence')).toHaveCount(1); // next Mon
    for (const d of ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-29']) {
      await expect(column(app, d).getByTestId('occurrence')).toHaveCount(0);
    }
  });

  test('ticking a future occurrence marks that date only', async ({ app }) => {
    await pinClock(app, [], [
      { id: 'r', title: 'Stretch', rule: { kind: 'daily' }, createdAt: WEDNESDAY.getTime(), order: 0, completions: {} },
    ]);
    await column(app, '2026-09-25').getByRole('checkbox', { name: 'Stretch' }).click();
    await expect(column(app, '2026-09-25').getByRole('checkbox', { name: 'Stretch' })).toHaveAttribute('aria-checked', 'true');
    await expect(column(app, '2026-09-24').getByRole('checkbox', { name: 'Stretch' })).toHaveAttribute('aria-checked', 'false');
    await expect(column(app, '2026-09-26').getByRole('checkbox', { name: 'Stretch' })).toHaveAttribute('aria-checked', 'false');
  });

  test('skipping one occurrence leaves the next one due', async ({ app }) => {
    await pinClock(app, [], [
      { id: 'r', title: 'Stretch', rule: { kind: 'daily' }, createdAt: WEDNESDAY.getTime(), order: 0, completions: {} },
    ]);
    await column(app, '2026-09-24').getByRole('button', { name: 'Repeating task actions' }).click();
    await app.getByRole('menuitem', { name: 'Skip this day' }).click();
    await expect(column(app, '2026-09-24').getByTestId('occurrence')).toHaveCount(0);
    await expect(column(app, '2026-09-25').getByTestId('occurrence')).toHaveCount(1);
  });

  test('an unfinished past task shows in the Overdue strip, not in today’s list', async ({ app }) => {
    await pinClock(app, [task('t', 'Taxes', '2026-09-21')]);
    const today = column(app, '2026-09-23');
    await expect(today.getByTestId('overdue')).toContainText('Taxes');
    await expect(today.getByRole('checkbox', { name: 'Taxes' })).toHaveCount(0);

    // It stays on Monday as history, greyed as missed.
    await app.getByRole('radio', { name: 'This week' }).click();
    await expect(column(app, '2026-09-21').getByText('missed')).toBeVisible();

    await today.getByRole('button', { name: 'Move Taxes to today' }).click();
    await expect(today.getByRole('checkbox', { name: 'Taxes' })).toBeVisible();
    await expect(app.getByTestId('overdue')).toHaveCount(0);
  });

  test('a missed recurring occurrence never enters the Overdue strip', async ({ app }) => {
    await pinClock(app, [], [
      {
        id: 'r', title: 'Journal', rule: { kind: 'daily' },
        createdAt: new Date(2026, 8, 20, 12).getTime(), order: 0, completions: {},
      },
    ]);
    await app.getByRole('radio', { name: 'This week' }).click();
    await expect(column(app, '2026-09-21').getByTestId('occurrence')).toHaveCount(1);
    await expect(app.getByTestId('overdue')).toHaveCount(0);
  });

  test('filtering by project hides other projects’ tasks in every column', async ({ app }) => {
    const project = (id: string, name: string) =>
      ({ id, name, createdAt: 0, order: 0, progress: { time: {} }, total: { time: 0 } });
    await pinClock(
      app,
      [
        task('a', 'Write chapter', '2026-09-23', { projectId: 'p1' }),
        task('b', 'Water plants', '2026-09-25', { projectId: 'p2' }),
        task('c', 'Call mum', '2026-09-24'),
      ],
      [{ id: 'r', title: 'Weed', projectId: 'p2', rule: { kind: 'daily' }, createdAt: WEDNESDAY.getTime(), order: 0, completions: {} }],
      [project('p1', 'Thesis'), project('p2', 'Garden')]
    );
    await app.getByLabel('Project filter').selectOption({ label: 'Thesis' });
    await expect(app.getByRole('checkbox', { name: 'Write chapter' })).toBeVisible();
    await expect(app.getByRole('checkbox', { name: 'Water plants' })).toHaveCount(0);
    await expect(app.getByRole('checkbox', { name: 'Call mum' })).toHaveCount(0);
    await expect(app.getByRole('checkbox', { name: 'Weed' })).toHaveCount(0);

    await app.getByLabel('Project filter').selectOption({ label: 'No project' });
    await expect(app.getByRole('checkbox', { name: 'Call mum' })).toBeVisible();
    await expect(app.getByRole('checkbox', { name: 'Write chapter' })).toHaveCount(0);
  });

  test('a task can be planned for a later day', async ({ app }) => {
    await pinClock(app);
    await app.getByPlaceholder('Add a task…').fill('Dentist');
    await app.getByLabel('Day', { exact: true }).selectOption('2026-09-26');
    await app.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(column(app, '2026-09-26').getByRole('checkbox', { name: 'Dentist' })).toBeVisible();
  });

  test('a task moved to tomorrow can move on again from there', async ({ app }) => {
    await pinClock(app);
    await addTask(app, 'Alpha');
    await openTaskMenu(app);
    await app.getByRole('menuitem', { name: 'Move to tomorrow' }).click();
    await column(app, '2026-09-24').getByRole('button', { name: 'Task actions' }).click();
    await app.getByRole('menuitem', { name: 'Move to next day' }).click();
    await expect(column(app, '2026-09-25').getByRole('checkbox', { name: 'Alpha' })).toBeVisible();
  });
});
