import { test, expect, switchTab, startWork, addTask } from './helpers';

test('time credits the project you picked', async ({ app }) => {
  await switchTab(app, 'Projects');
  await app.getByRole('button', { name: 'New project' }).click();
  await app.getByLabel('Name').fill('Learn to code');
  await app.getByRole('button', { name: 'Create' }).click();
  await app.getByRole('button', { name: 'Track time on Learn to code' }).click();

  await startWork(app);
  await app.waitForTimeout(2500);
  await app.getByRole('button', { name: 'Stop' }).click();

  const entries = await app.evaluate(
    () => JSON.parse(localStorage.getItem('tt-session')!).state.daily.entries
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].projectId).toBeTruthy();
});

test('switching target closes one entry and opens another', async ({ app }) => {
  await addTask(app, 'Write the parser');
  await startWork(app);
  await app.getByRole('button', { name: 'Track time on Write the parser' }).click();
  await app.waitForTimeout(2000);
  await app.getByRole('button', { name: 'Stop' }).click();

  const entries = await app.evaluate(
    () => JSON.parse(localStorage.getItem('tt-session')!).state.daily.entries
  );
  expect(entries.length).toBeGreaterThanOrEqual(2);
  expect(entries.at(-1).taskId).toBeTruthy();
});
