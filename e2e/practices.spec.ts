import type { Page } from '@playwright/test';
import { addPractice, advance, expect, MIN, openPractices, pickLevel, startState, test } from './helpers';

/** Choose what the next session is for, in the timer's "For" picker. */
async function pickFor(page: Page, name: string) {
  await page.getByLabel('For', { exact: true }).selectOption({ label: name });
}

async function startTimed(page: Page, minutes: number) {
  await page.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
  await page.getByRole('spinbutton', { name: 'Custom minutes' }).fill(String(minutes));
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/^Timed running/)).toBeVisible();
}

/** Set the weekly cap from the Practices tab, which must be open. */
async function setCap(page: Page, hours: number) {
  await page.getByRole('button', { name: /^(Set|Change) cap$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Weekly cap' });
  await dialog.getByLabel('Hours a week').fill(String(hours));
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
}

/** A level button in the open practice editor. */
const level = (page: Page, name: string) =>
  page
    .getByRole('dialog')
    .getByRole('group', { name: 'Level', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}`) });

const timeLine = (page: Page, name: string) => page.getByRole('button', { name: `Edit ${name}` }).getByTestId('practice-time');

test.describe('practices', () => {
  test('starts empty, and says what a practice is', async ({ app }) => {
    await openPractices(app);
    await expect(app.getByText('No practices yet.')).toBeVisible();
    await expect(app.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  });

  test('adds a practice with its steps and what they need', async ({ app }) => {
    await openPractices(app);
    await app.getByRole('button', { name: 'Add practice' }).click();
    const dialog = app.getByRole('dialog', { name: 'Add practice' });

    // A name is required.
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Name').fill('Guitar');
    await expect(save).toBeEnabled();

    // Steady is the default, and each level shows its target.
    await expect(dialog.getByRole('button', { name: /^Steady/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: /^Steady/ })).toContainText('4× · 20 min');

    await dialog.getByLabel('Small step', { exact: true }).fill('Play one scale');
    await dialog.getByRole('group', { name: 'Small step needs' }).getByRole('button', { name: 'Clarity' }).click();
    await dialog.getByLabel('Low-day step', { exact: true }).fill('Hold the guitar');
    await expect(dialog.getByRole('group', { name: 'Low-day step needs' }).getByText('Little of either')).toBeVisible();
    await save.click();

    const row = app.getByRole('button', { name: 'Edit Guitar' });
    await expect(row).toContainText('4× a week · 20 min');
    await expect(app.getByText('No practices yet.')).toHaveCount(0);

    // Everything was kept.
    await row.click();
    const editor = app.getByRole('dialog', { name: 'Edit practice' });
    const smallNeeds = editor.getByRole('group', { name: 'Small step needs' });
    await expect(editor.getByLabel('Small step', { exact: true })).toHaveValue('Play one scale');
    await expect(editor.getByLabel('Low-day step', { exact: true })).toHaveValue('Hold the guitar');
    await expect(smallNeeds.getByRole('button', { name: 'Clarity' })).toHaveAttribute('aria-pressed', 'true');
    await expect(smallNeeds.getByRole('button', { name: 'Energy' })).toHaveAttribute('aria-pressed', 'false');
    await expect(smallNeeds.getByText('Little of either')).toHaveCount(0);
  });

  test('changes the level and the name', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar', 'Serious');
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('6× a week · 30 min');

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit practice' });
    await pickLevel(app, 'Light');
    await dialog.getByLabel('Name').fill('Classical guitar');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Edit Classical guitar' })).toContainText('3× a week · 15 min');
  });

  test('a paused practice is dimmed and listed last', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar');
    await addPractice(app, 'Drawing');
    await addPractice(app, 'Spanish');
    const rows = app.getByRole('button', { name: /^Edit / });
    await expect(rows).toHaveText([/Guitar/, /Drawing/, /Spanish/]);

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await pickLevel(app, 'Paused');
    await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();

    await expect(rows).toHaveText([/Drawing/, /Spanish/, /Guitar/]);
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Paused');
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveAttribute('data-paused', 'true');
    await expect(app.getByRole('button', { name: 'Edit Drawing' })).toHaveAttribute('data-paused', 'false');

    // Un-pausing puts it back where it was.
    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await pickLevel(app, 'Light');
    await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();
    await expect(rows).toHaveText([/Guitar/, /Drawing/, /Spanish/]);
  });

  test('delete asks first, and can be backed out of', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar');

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit practice' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog.getByText('Delete Guitar?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(dialog.getByText('Delete Guitar?')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toBeVisible();

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete Guitar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveCount(0);
    await expect(app.getByText('No practices yet.')).toBeVisible();
  });

  test('keeps practices across a reload', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar', 'Minimal');
    await app.reload();
    await openPractices(app);
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('1× a week · 10 min');
  });

  test('cancel adds nothing', async ({ app }) => {
    await openPractices(app);
    await app.getByRole('button', { name: 'Add practice' }).click();
    const dialog = app.getByRole('dialog', { name: 'Add practice' });
    await dialog.getByLabel('Name').fill('Nothing');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.getByText('No practices yet.')).toBeVisible();
  });


  test.describe('time on a practice', () => {
    test('has no For picker until there is a practice, and lists Paused ones last', async ({ app }) => {
      await expect(app.getByLabel('For', { exact: true })).toHaveCount(0);
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Paused');
      await addPractice(app, 'Drawing');
      await expect(app.getByLabel('For', { exact: true }).locator('option')).toHaveText(['None', 'Drawing', 'Guitar (paused)']);
    });

    test('shows nothing on a row until it has time', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await expect(timeLine(app, 'Guitar')).toHaveCount(0);
    });

    test('a Timed session shows in the row, this week and in total', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      // Steady counts from 20 minutes, which is where the length starts.
      await app.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
      await expect(app.getByRole('spinbutton', { name: 'Custom minutes' })).toHaveValue('20');
      await app.getByRole('button', { name: 'Start', exact: true }).click();
      await expect(app.getByText('Timed running · Guitar')).toBeVisible();
      await advance(app, 20 * MIN);
      await expect(app.getByText('Stopped')).toBeVisible();

      await expect(timeLine(app, 'Guitar')).toHaveText('20m this week · 20m since October');
    });

    test('picking a practice presets the Timed length to its level minimum', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Serious');
      await addPractice(app, 'Drawing', 'Light');
      await app.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
      const minutes = app.getByRole('spinbutton', { name: 'Custom minutes' });
      await expect(minutes).toHaveValue('20');
      await pickFor(app, 'Guitar');
      await expect(minutes).toHaveValue('30');
      await pickFor(app, 'Drawing');
      await expect(minutes).toHaveValue('15');
    });

    test('Flow Focus, Rest, then Focus is one session of the Focus time', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      await startState(app, 'Focus');
      await expect(app.getByText('Focus running · Guitar')).toBeVisible();
      await advance(app, 25 * MIN);
      await startState(app, 'Rest');
      await expect(app.getByText('Rest running · Guitar')).toBeVisible();
      await advance(app, 5 * MIN);
      await startState(app, 'Focus');
      await advance(app, 10 * MIN);
      await app.getByRole('button', { name: 'Stop' }).click();

      // 25 + 10 minutes of Focus; the 5 minutes of Rest are not practice time.
      await expect(timeLine(app, 'Guitar')).toHaveText('35m this week · 35m since October');
    });

    test('the picker is locked while a session runs', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await addPractice(app, 'Drawing');
      await pickFor(app, 'Guitar');
      await startState(app, 'Focus');
      const picker = app.getByLabel('For', { exact: true });
      await expect(picker).toBeDisabled();
      await expect(picker).toHaveValue(await picker.locator('option', { hasText: 'Guitar' }).getAttribute('value') ?? '');
      await app.getByRole('button', { name: 'Stop' }).click();
      await expect(picker).toBeEnabled();
      await expect(app.getByText('Stopped')).toBeVisible();
    });

    test('time with no practice is not counted for one', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await startState(app, 'Focus');
      await advance(app, 30 * MIN);
      await app.getByRole('button', { name: 'Stop' }).click();
      await expect(timeLine(app, 'Guitar')).toHaveCount(0);
    });

    test('a new week starts the weekly figure over, and keeps the total', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      await startTimed(app, 20);
      await advance(app, 20 * MIN);
      await expect(timeLine(app, 'Guitar')).toHaveText('20m this week · 20m since October');

      // Monday 19 Oct, 10:00.
      await advance(app, 7 * 24 * 60 * MIN - 20 * MIN);
      await expect(timeLine(app, 'Guitar')).toHaveText('0m this week · 20m since October');
    });

    test('a deleted practice leaves the picker', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await addPractice(app, 'Drawing');
      await pickFor(app, 'Guitar');
      await startTimed(app, 20);
      await advance(app, 20 * MIN);
      await app.getByRole('dialog', { name: 'Next step for Guitar' }).getByRole('button', { name: 'Skip' }).click();

      await app.getByRole('button', { name: 'Edit Guitar' }).click();
      const dialog = app.getByRole('dialog', { name: 'Edit practice' });
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await dialog.getByRole('button', { name: 'Delete Guitar' }).click();
      await expect(app.getByLabel('For', { exact: true }).locator('option')).toHaveText(['None', 'Drawing']);
      await expect(timeLine(app, 'Drawing')).toHaveCount(0);
    });
  });

  test.describe('next step', () => {
    const ask = (page: Page, name: string) => page.getByRole('dialog', { name: `Next step for ${name}` });

    /** Run a short Flow session for the picked practice and stop it. */
    async function session(page: Page) {
      await startState(page, 'Focus');
      await advance(page, 25 * MIN);
      await page.getByRole('button', { name: 'Stop' }).click();
    }

    test('asks when a session is stopped, and shows the note on the next start', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      await expect(app.getByTestId('next-step')).toHaveCount(0);

      await session(app);
      await expect(ask(app, 'Guitar')).toBeVisible();
      await expect(ask(app, 'Guitar').getByRole('heading', { name: 'Next step for Guitar?' })).toBeVisible();
      const save = ask(app, 'Guitar').getByRole('button', { name: 'Save' });
      await expect(save).toBeDisabled();
      await ask(app, 'Guitar').getByLabel('Next step').fill('Learn the intro');
      await save.click();
      await expect(ask(app, 'Guitar')).toHaveCount(0);

      // Under the picker for the next session, and on the row.
      await expect(app.getByTestId('next-step')).toHaveText('Next: Learn the intro');
      await expect(app.getByRole('button', { name: 'Edit Guitar' }).getByTestId('practice-next-step')).toHaveText(
        'Next: Learn the intro'
      );
      await startState(app, 'Focus');
      await expect(app.getByTestId('next-step')).toHaveText('Next: Learn the intro');
    });

    test('Skip keeps the old note', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      await session(app);
      await ask(app, 'Guitar').getByLabel('Next step').fill('Learn the intro');
      await ask(app, 'Guitar').getByRole('button', { name: 'Save' }).click();

      await session(app);
      await ask(app, 'Guitar').getByLabel('Next step').fill('Something else');
      await ask(app, 'Guitar').getByRole('button', { name: 'Skip' }).click();
      await expect(ask(app, 'Guitar')).toHaveCount(0);
      await expect(app.getByTestId('next-step')).toHaveText('Next: Learn the intro');

      // Escape is a skip too.
      await session(app);
      await expect(ask(app, 'Guitar')).toBeVisible();
      await app.keyboard.press('Escape');
      await expect(ask(app, 'Guitar')).toHaveCount(0);
      await expect(app.getByTestId('next-step')).toHaveText('Next: Learn the intro');
    });

    test('a new note replaces the old one', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      for (const note of ['Learn the intro', 'Play it slowly']) {
        await session(app);
        await ask(app, 'Guitar').getByLabel('Next step').fill(note);
        await ask(app, 'Guitar').getByRole('button', { name: 'Save' }).click();
      }
      await expect(app.getByTestId('next-step')).toHaveText('Next: Play it slowly');
    });

    test('does not ask when Focus moves to Rest, or when no practice was picked', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await startState(app, 'Focus');
      await advance(app, 25 * MIN);
      await app.getByRole('button', { name: 'Stop' }).click();
      await expect(app.getByText('Stopped')).toBeVisible();
      await expect(app.getByRole('dialog')).toHaveCount(0);

      await pickFor(app, 'Guitar');
      await startState(app, 'Focus');
      await advance(app, 25 * MIN);
      await startState(app, 'Rest');
      await advance(app, 5 * MIN);
      await expect(app.getByRole('dialog')).toHaveCount(0);
      await app.getByRole('button', { name: 'Stop' }).click();
      await expect(ask(app, 'Guitar')).toBeVisible();
    });

    test('asks when a Timed session runs out', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      await startTimed(app, 20);
      await advance(app, 19 * MIN);
      await expect(ask(app, 'Guitar')).toHaveCount(0);
      await advance(app, 2 * MIN);
      await expect(ask(app, 'Guitar')).toBeVisible();
    });

    test('asks on reopening only if the session ended in the last ten minutes', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar');
      await pickFor(app, 'Guitar');
      await startTimed(app, 10);
      await advance(app, 4 * MIN);
      await app.reload();
      await expect(app.getByText('Timed running · Guitar')).toBeVisible();

      // It ended 2 minutes ago.
      await advance(app, 8 * MIN);
      await expect(ask(app, 'Guitar')).toBeVisible();
      await ask(app, 'Guitar').getByRole('button', { name: 'Skip' }).click();

      await pickFor(app, 'Guitar');
      await startTimed(app, 10);
      await advance(app, 4 * MIN);
      await app.reload();
      await expect(app.getByText('Timed running · Guitar')).toBeVisible();

      // It ended 26 minutes ago: too long to ask.
      await advance(app, 30 * MIN);
      await expect(app.getByText('Stopped')).toBeVisible();
      await expect(app.getByRole('dialog')).toHaveCount(0);
    });
  });

  test.describe('weekly cap', () => {
    test('shows what is planned, with no cap until one is set', async ({ app }) => {
      await openPractices(app);
      await expect(app.getByTestId('planned')).toHaveCount(0);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await addPractice(app, 'Spanish', 'Paused');
      await expect(app.getByTestId('planned')).toHaveText('Planned 2h 20m a week · no cap');
      await expect(app.getByTestId('over-cap')).toHaveCount(0);
    });

    test('sets, changes and removes the cap, and keeps it across a reload', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await app.getByRole('button', { name: 'Set cap' }).click();
      const dialog = app.getByRole('dialog', { name: 'Weekly cap' });
      await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Remove cap' })).toHaveCount(0);
      await dialog.getByLabel('Hours a week').fill('0');
      await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
      await dialog.getByLabel('Hours a week').fill('8');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 30m a week · cap 8h');

      await app.reload();
      await openPractices(app);
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 30m a week · cap 8h');

      await setCap(app, 8.5);
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 30m a week · cap 8h 30m');

      await app.getByRole('button', { name: 'Change cap' }).click();
      await app.getByRole('dialog', { name: 'Weekly cap' }).getByRole('button', { name: 'Remove cap' }).click();
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 30m a week · no cap');
    });

    test('a level that would pass the cap is disabled, and says why', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 3); // 140 of 180 planned

      await app.getByRole('button', { name: 'Add practice' }).click();
      await expect(level(app, 'Serious')).toBeDisabled();
      await expect(level(app, 'Steady')).toBeDisabled();
      await expect(level(app, 'Light')).toBeDisabled();
      await expect(level(app, 'Minimal')).toBeEnabled();
      await expect(level(app, 'Paused')).toBeEnabled();
      // Steady does not fit, so the new practice starts at the most that does.
      await expect(level(app, 'Minimal')).toHaveAttribute('aria-pressed', 'true');
      await expect(app.getByTestId('cap-warning')).toHaveText(
        'Over your 3h cap by 10m. Lower another practice or raise the cap.'
      );
    });

    test('Serious is out for a third practice under a 2h cap with Steady and Light', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 2);
      await app.getByRole('button', { name: 'Add practice' }).click();
      await expect(level(app, 'Serious')).toBeDisabled();
      // Already over the cap, so only Paused, which adds nothing, is left.
      await expect(level(app, 'Minimal')).toBeDisabled();
      await expect(level(app, 'Paused')).toBeEnabled();
      await expect(level(app, 'Paused')).toHaveAttribute('aria-pressed', 'true');
    });

    test('lowering the cap below the plan warns in the header and changes nothing', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 8);
      await expect(app.getByTestId('over-cap')).toHaveCount(0);
      await setCap(app, 2);
      await expect(app.getByTestId('over-cap')).toHaveText('Over cap by 20m');
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('4× a week · 20 min');
      await expect(app.getByRole('button', { name: 'Edit Drawing' })).toContainText('3× a week · 15 min');
    });

    test('an edited practice can keep or lower its level over the cap, but not raise it', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 2);

      await app.getByRole('button', { name: 'Edit Drawing' }).click();
      await expect(level(app, 'Light')).toBeEnabled();
      await expect(level(app, 'Minimal')).toBeEnabled();
      await expect(level(app, 'Steady')).toBeDisabled();
      await pickLevel(app, 'Minimal');
      await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();
      // 90 + 15 = 105 of 120.
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 45m a week · cap 2h');
      await expect(app.getByTestId('over-cap')).toHaveCount(0);

      // Raising Drawing back to Light (90 + 50 = 140) is over the cap again.
      await app.getByRole('button', { name: 'Edit Drawing' }).click();
      await expect(level(app, 'Light')).toBeDisabled();
      await expect(app.getByTestId('cap-warning')).toHaveText(
        'Over your 2h cap by 20m. Lower another practice or raise the cap.'
      );
    });

    test('with no cap every level is open', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Serious');
      await app.getByRole('button', { name: 'Add practice' }).click();
      await expect(level(app, 'Serious')).toBeEnabled();
      await expect(app.getByTestId('cap-warning')).toHaveCount(0);
    });
  });
});
