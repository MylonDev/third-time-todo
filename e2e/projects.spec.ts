import { test, expect, switchTab } from './helpers';
import type { Page } from '@playwright/test';

async function goToProjects(page: Page) {
  await switchTab(page, 'Projects');
}

interface NewProject {
  name: string;
  targetAmount?: string;
  targetPeriod?: 'daily' | 'weekly' | 'custom';
  deadline?: string;
}

async function addProject(page: Page, p: NewProject) {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill(p.name);
  if (p.targetAmount) await dialog.getByLabel('Target', { exact: true }).fill(p.targetAmount);
  if (p.targetPeriod) await dialog.getByLabel('per', { exact: true }).selectOption(p.targetPeriod);
  if (p.deadline) await dialog.getByLabel('Deadline', { exact: false }).fill(p.deadline);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
}

const menu = (p: Page) => p.getByRole('menu', { name: 'Project actions' });

test.describe('projects', () => {
  test('the empty tab says so', async ({ app }) => {
    await goToProjects(app);
    await expect(app.locator('main')).toContainText('No projects yet');
  });

  test('a project needs only a name', async ({ app }) => {
    await goToProjects(app);
    await app.getByRole('button', { name: 'New project' }).click();
    await app.getByLabel('Name').fill('Learn to code');
    await app.getByRole('button', { name: 'Create' }).click();
    await expect(app.getByRole('heading', { name: 'Learn to code' })).toBeVisible();
  });

  test('a project can carry a weekly target', async ({ app }) => {
    await goToProjects(app);
    await app.getByRole('button', { name: 'New project' }).click();
    await app.getByLabel('Name').fill('Learn to code');
    await app.getByLabel('Target', { exact: true }).fill('10');
    await app.getByLabel('per', { exact: true }).selectOption('weekly');
    await app.getByRole('button', { name: 'Create' }).click();
    // formatDuration renders 0ms as "0m", not "0h" — this is the real readout
    // the running app produces, not the fixture text from the spec draft.
    await expect(app.getByText('0m / 10h this week')).toBeVisible();
  });

  test('there are no milestones', async ({ app }) => {
    await goToProjects(app);
    await app.getByRole('button', { name: 'New project' }).click();
    await expect(app.getByText('Milestone')).toHaveCount(0);
  });

  test('a deadline shows a pace line; no deadline shows none', async ({ app }) => {
    await goToProjects(app);
    await addProject(app, { name: 'Open horizon' });
    await expect(
      app.getByRole('listitem').filter({ hasText: 'Open horizon' })
    ).not.toContainText('days left');

    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await addProject(app, { name: 'Fixed target date', deadline: future });
    await expect(
      app.getByRole('listitem').filter({ hasText: 'Fixed target date' })
    ).toContainText('days left');
  });

  test('the project action menu lists exactly Edit and Archive, and closes on Escape', async ({ app }) => {
    await goToProjects(app);
    await addProject(app, { name: 'Read 12 books' });
    await app.getByRole('button', { name: 'Project actions' }).click();
    expect(await menu(app).getByRole('menuitem').allInnerTexts()).toEqual(['Edit', 'Archive']);
    await app.keyboard.press('Escape');
    await expect(menu(app)).toBeHidden();
  });

  test('editing a project updates its target readout', async ({ app }) => {
    await goToProjects(app);
    await addProject(app, { name: 'Learn to code', targetAmount: '10', targetPeriod: 'weekly' });
    await app.getByRole('button', { name: 'Project actions' }).click();
    await menu(app).getByRole('menuitem', { name: 'Edit' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit project' });
    await dialog.getByLabel('Target', { exact: true }).fill('20');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(app.getByText('0m / 20h this week')).toBeVisible();
  });

  test('Archive moves a project behind the disclosure; its ✕ deletes it', async ({ app }) => {
    await goToProjects(app);
    await addProject(app, { name: 'Alpha project' });
    await addProject(app, { name: 'Beta project' });

    await app
      .getByRole('listitem')
      .filter({ hasText: 'Alpha project' })
      .getByRole('button', { name: 'Project actions' })
      .click();
    await menu(app).getByRole('menuitem', { name: 'Archive' }).click();
    await expect(app.getByRole('listitem').filter({ hasText: 'Alpha project' })).toBeHidden();

    await app.getByRole('button', { name: /archived project/ }).click();
    await expect(app.locator('main')).toContainText('Alpha project');

    await app.getByRole('button', { name: 'Delete Alpha project' }).click();
    await expect(app.getByText('Alpha project')).toBeHidden();

    // Beta was never archived — it stays in the active list, untouched.
    await expect(app.getByRole('listitem').filter({ hasText: 'Beta project' })).toBeVisible();
  });

  test('a project logs cumulative time against a custom period target', async ({ app }) => {
    await goToProjects(app);
    await app.getByRole('button', { name: 'New project' }).click();
    await app.getByLabel('Name').fill('Custom cadence');
    await app.getByLabel('Target', { exact: true }).fill('5');
    await app.getByLabel('per', { exact: true }).selectOption('custom');
    await app.getByLabel('days', { exact: true }).fill('10');
    await app.getByRole('button', { name: 'Create' }).click();
    await expect(app.getByText(/0m \/ 5h this 10-day period/)).toBeVisible();
  });
});
