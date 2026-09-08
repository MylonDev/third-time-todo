import { test, expect, switchTab } from './helpers';
import type { Page } from '@playwright/test';

async function goToGoals(page: Page) {
  await switchTab(page, 'Goals');
}

interface NewGoal {
  name: string;
  measure?: 'Time' | 'Count' | 'Open';
  unit?: string;
  target?: string;
  hours?: string;
  milestones?: string[];
}

async function addGoal(page: Page, g: NewGoal) {
  await page.getByRole('button', { name: '+ New goal' }).click();
  const dialog = page.getByRole('dialog', { name: 'New goal' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill(g.name);
  if (g.measure) await dialog.getByRole('button', { name: new RegExp(`^${g.measure}`) }).click();
  if (g.unit) await dialog.getByRole('textbox', { name: 'Unit' }).fill(g.unit);
  if (g.target) await dialog.getByRole('spinbutton', { name: 'Target', exact: true }).fill(g.target);
  if (g.hours) await dialog.getByRole('spinbutton', { name: 'Target hours' }).fill(g.hours);
  for (const m of g.milestones ?? []) {
    await dialog.getByRole('button', { name: '+ Add milestone' }).click();
    await dialog.getByPlaceholder(/^Milestone/).last().fill(m);
  }
  await dialog.getByRole('button', { name: 'Create goal' }).click();
  await expect(dialog).toBeHidden();
}

const menu = (p: Page) => p.getByRole('menu', { name: 'Goal actions' });

test.describe('goals', () => {
  test('the empty tab says so', async ({ app }) => {
    await goToGoals(app);
    await expect(app.locator('main')).toContainText('No goals yet');
  });

  test('adds a count goal and logs progress against it', async ({ app }) => {
    await goToGoals(app);
    await addGoal(app, { name: 'Cycle 1,000 km', measure: 'Count', unit: 'km', target: '1000' });

    const card = app.getByRole('listitem').filter({ hasText: 'Cycle 1,000 km' });
    await expect(card).toContainText('0 / 1000');
    await card.getByRole('button', { name: 'Log +1 for Cycle 1,000 km' }).click();
    await expect(card).toContainText('1 / 1000');
    await card.getByRole('button', { name: 'Log −1 for Cycle 1,000 km' }).click();
    await expect(card).toContainText('0 / 1000');
  });

  test('the Create button is blocked until the goal is more than a task', async ({ app }) => {
    await goToGoals(app);
    await app.getByRole('button', { name: '+ New goal' }).click();
    const dialog = app.getByRole('dialog', { name: 'New goal' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Vague');
    await dialog.getByRole('button', { name: /^Open/ }).click();
    await expect(dialog.getByRole('button', { name: 'Create goal' })).toBeDisabled();
    await dialog.getByRole('button', { name: '+ Add milestone' }).click();
    await dialog.getByPlaceholder(/^Milestone/).fill('A first step');
    await expect(dialog.getByRole('button', { name: 'Create goal' })).toBeEnabled();
  });

  test('an open goal carried by milestones can be completed', async ({ app }) => {
    await goToGoals(app);
    await addGoal(app, {
      name: 'Ship redesign',
      measure: 'Open',
      milestones: ['Mockups', 'Ship'],
    });
    const card = app.getByRole('listitem').filter({ hasText: 'Ship redesign' });
    await card.getByRole('button', { name: 'Mockups' }).click();
    await card.getByRole('button', { name: 'Ship' }).click();
    await expect(card).toContainText('Met');
    await card.getByRole('button', { name: 'Archive or evolve →' }).click();
    await expect(app.getByRole('dialog', { name: 'Goal complete' })).toBeVisible();
  });

  test('the goal action menu lists exactly its actions and closes on Escape', async ({ app }) => {
    await goToGoals(app);
    await addGoal(app, { name: 'Read 12 books', measure: 'Count', unit: 'books', target: '12' });
    await app.getByRole('button', { name: 'Goal actions' }).click();
    expect(await menu(app).getByRole('menuitem').allInnerTexts()).toEqual([
      'Edit',
      'Archive',
      'Delete',
    ]);
    await app.keyboard.press('Escape');
    await expect(menu(app)).toBeHidden();
  });

  test('Archive moves a goal behind the disclosure; Delete removes it', async ({ app }) => {
    await goToGoals(app);
    await addGoal(app, { name: 'Alpha goal', measure: 'Count', unit: 'x', target: '5' });
    await addGoal(app, { name: 'Beta goal', measure: 'Count', unit: 'x', target: '5' });

    await app
      .getByRole('listitem')
      .filter({ hasText: 'Alpha goal' })
      .getByRole('button', { name: 'Goal actions' })
      .click();
    await menu(app).getByRole('menuitem', { name: 'Archive' }).click();
    await expect(app.getByRole('listitem').filter({ hasText: 'Alpha goal' })).toBeHidden();

    await app.getByRole('button', { name: /archived goal/ }).click();
    await expect(app.locator('main')).toContainText('Alpha goal');

    await app
      .getByRole('listitem')
      .filter({ hasText: 'Beta goal' })
      .getByRole('button', { name: 'Goal actions' })
      .click();
    await menu(app).getByRole('menuitem', { name: 'Delete' }).click();
    await expect(app.getByText('Beta goal')).toBeHidden();
  });

  test('pace needs a deadline', async ({ app }) => {
    await goToGoals(app);
    await addGoal(app, { name: 'Run 500 km', measure: 'Count', unit: 'km', target: '500' });
    await expect(
      app.getByRole('listitem').filter({ hasText: 'Run 500 km' })
    ).toContainText('Set a deadline to see whether you’re on pace.');
  });

  test('a legacy boolean goal migrates to open + effort and renders sanely', async ({ app }) => {
    await app.evaluate(() => {
      localStorage.setItem(
        'tt-goals',
        JSON.stringify({
          state: {
            goals: [
              {
                id: 'legacy-1',
                title: 'Meditate',
                type: 'boolean',
                period: 'weekly',
                createdAt: Date.now() - 86_400_000,
                order: 0,
                progress: {},
              },
            ],
          },
          version: 1,
        })
      );
    });
    await app.reload();
    await switchTab(app, 'Goals');

    const card = app.getByRole('listitem').filter({ hasText: 'Meditate' });
    await expect(card).toContainText('Open');
    await expect(card).toContainText('this week');
    await card.getByRole('button', { name: 'Log +1 for Meditate' }).click();
    await expect(card).toContainText('1 times / 1 times this week');
  });

  test('evolving a met goal links the two and shows the chain', async ({ app }) => {
    await goToGoals(app);
    await addGoal(app, { name: 'Run a 5k', measure: 'Open', milestones: ['Finish it'] });
    const card = app.getByRole('listitem').filter({ hasText: 'Run a 5k' });
    await card.getByRole('button', { name: 'Finish it' }).click();
    await card.getByRole('button', { name: 'Archive or evolve →' }).click();

    await app.getByRole('dialog', { name: 'Goal complete' }).getByRole('button', { name: /Evolve it/ }).click();

    const form = app.getByRole('dialog', { name: 'New goal' });
    await expect(form).toContainText('Run a 5k');
    await form.getByRole('textbox', { name: 'Name' }).fill('Run a 10k');
    await form.getByRole('button', { name: /^Open/ }).click();
    await form.getByRole('button', { name: '+ Add milestone' }).click();
    await form.getByPlaceholder(/^Milestone/).fill('Finish it');
    await form.getByRole('button', { name: 'Create goal' }).click();
    await expect(form).toBeHidden();

    await expect(
      app.getByRole('listitem').filter({ hasText: 'Run a 10k' })
    ).toContainText('Run a 5k');
  });
});
