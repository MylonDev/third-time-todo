import type { Page } from '@playwright/test';
import { addPractice, advance, expect, MIN, openPractices, pickTemplate, startState, test } from './helpers';

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

/** A template button in the open practice editor. */
const template = (page: Page, name: string) =>
  page
    .getByRole('dialog')
    .getByRole('group', { name: 'Template', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}`) });

const daysGroup = (page: Page) => page.getByRole('dialog').getByRole('group', { name: 'Days a week', exact: true });
const minutesField = (page: Page) => page.getByRole('dialog').getByRole('spinbutton', { name: 'Minutes a day' });
const weekday = (page: Page, name: string) => page.getByRole('dialog').getByRole('group', { name: 'Weekdays' }).getByRole('button', { name, exact: true });

/** Add a Custom practice from the Practices tab: either some days a week or chosen weekdays, and the minutes a day. */
async function addCustom(page: Page, name: string, target: { days?: number; weekdays?: string[]; minutes: number }) {
  await page.getByRole('button', { name: 'Add practice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add practice' });
  await dialog.getByLabel('Name').fill(name);
  await pickTemplate(page, 'Custom');
  if (target.weekdays) {
    await dialog.getByRole('button', { name: 'Specific days' }).click();
    for (const day of target.weekdays) await weekday(page, day).click();
  } else {
    await daysGroup(page)
      .getByRole('button', { name: String(target.days), exact: true })
      .click();
  }
  await minutesField(page).fill(String(target.minutes));
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
}

const timeLine = (page: Page, name: string) => page.getByRole('button', { name: `Edit ${name}` }).getByTestId('practice-time');

test.describe('practices', () => {
  test('starts empty, and says what a practice is', async ({ app }) => {
    await openPractices(app);
    await expect(app.getByText('No practices yet.')).toBeVisible();
    await expect(app.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  });

  test('adds a practice with just a name and a template', async ({ app }) => {
    await openPractices(app);
    await app.getByRole('button', { name: 'Add practice' }).click();
    const dialog = app.getByRole('dialog', { name: 'Add practice' });

    // A name is required.
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Name').fill('Guitar');
    await expect(save).toBeEnabled();

    // Steady is the default, and each template shows its target.
    await expect(template(app, 'Steady')).toHaveAttribute('aria-pressed', 'true');
    await expect(template(app, 'Steady')).toContainText('4 days · 20 min');
    await expect(template(app, 'Minimal')).toContainText('1 day · 10 min');
    await expect(template(app, 'Serious')).toContainText('6 days · 30 min');
    await expect(template(app, 'Custom')).toHaveAttribute('aria-pressed', 'false');

    // There is nothing else to fill in: no steps, and no custom fields until asked for.
    await expect(dialog.getByRole('textbox')).toHaveCount(1);
    await expect(daysGroup(app)).toHaveCount(0);
    await expect(minutesField(app)).toHaveCount(0);
    await save.click();

    const row = app.getByRole('button', { name: 'Edit Guitar' });
    await expect(row).toContainText('Steady · 4 days a week · 20 min');
    await expect(app.getByText('No practices yet.')).toHaveCount(0);

    // The template was kept.
    await row.click();
    await expect(template(app, 'Steady')).toHaveAttribute('aria-pressed', 'true');
  });

  test('changes the template and the name', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar', 'Serious');
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Serious · 6 days a week · 30 min');

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    const dialog = app.getByRole('dialog', { name: 'Edit practice' });
    await pickTemplate(app, 'Light');
    await dialog.getByLabel('Name').fill('Classical guitar');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Edit Classical guitar' })).toContainText('Light · 3 days a week · 15 min');
  });

  test.describe('a custom target', () => {
    test('Custom reveals the days and minutes, starting from the template it came from', async ({ app }) => {
      await openPractices(app);
      await app.getByRole('button', { name: 'Add practice' }).click();
      await pickTemplate(app, 'Custom');
      await expect(template(app, 'Custom')).toHaveAttribute('aria-pressed', 'true');
      await expect(template(app, 'Steady')).toHaveAttribute('aria-pressed', 'false');
      // Steady was picked, so Custom starts at its 4 days and 20 minutes.
      await expect(daysGroup(app).getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(minutesField(app)).toHaveValue('20');
      await expect(app.getByRole('dialog').getByRole('button', { name: 'Specific days' })).toHaveAttribute('aria-pressed', 'false');
      await expect(app.getByRole('dialog').getByRole('group', { name: 'Weekdays' })).toHaveCount(0);
    });

    test('saves its own days and minutes, and shows them without a template name', async ({ app }) => {
      await openPractices(app);
      await addCustom(app, 'Guitar', { days: 5, minutes: 25 });
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('5 days a week · 25 min');
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).not.toContainText('Steady');
      await expect(app.getByTestId('planned')).toHaveText('Planned 2h 5m a week · no cap');

      // It opens as Custom, with what was set.
      await app.getByRole('button', { name: 'Edit Guitar' }).click();
      await expect(template(app, 'Custom')).toHaveAttribute('aria-pressed', 'true');
      await expect(daysGroup(app).getByRole('button', { name: '5', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(minutesField(app)).toHaveValue('25');
    });

    test('flips back to a template chip when one is chosen, hiding the fields', async ({ app }) => {
      await openPractices(app);
      await addCustom(app, 'Guitar', { days: 5, minutes: 25 });
      await app.getByRole('button', { name: 'Edit Guitar' }).click();
      await pickTemplate(app, 'Light');
      await expect(template(app, 'Light')).toHaveAttribute('aria-pressed', 'true');
      await expect(template(app, 'Custom')).toHaveAttribute('aria-pressed', 'false');
      await expect(daysGroup(app)).toHaveCount(0);
      await expect(minutesField(app)).toHaveCount(0);
      await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Light · 3 days a week · 15 min');
    });

    test('Specific days swap the days for a count of the chosen weekdays', async ({ app }) => {
      await openPractices(app);
      await app.getByRole('button', { name: 'Add practice' }).click();
      const dialog = app.getByRole('dialog', { name: 'Add practice' });
      await dialog.getByLabel('Name').fill('Guitar');
      await pickTemplate(app, 'Custom');
      await dialog.getByRole('button', { name: 'Specific days' }).click();

      // No days chosen yet: the days control is gone and Save waits.
      await expect(daysGroup(app)).toHaveCount(0);
      await expect(app.getByTestId('chosen-days')).toHaveText('Pick the days below');
      await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

      await weekday(app, 'Mon').click();
      await weekday(app, 'Fri').click();
      await weekday(app, 'Wed').click();
      await expect(app.getByTestId('chosen-days')).toHaveText('3 days');
      await weekday(app, 'Wed').click();
      await expect(app.getByTestId('chosen-days')).toHaveText('2 days');
      await weekday(app, 'Wed').click();
      await minutesField(app).fill('30');
      await dialog.getByRole('button', { name: 'Save' }).click();

      // Listed in week order, whatever order they were picked in.
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Mon Wed Fri · 30 min');
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 30m a week · no cap');

      await app.reload();
      await openPractices(app);
      await app.getByRole('button', { name: 'Edit Guitar' }).click();
      await expect(app.getByRole('dialog').getByRole('button', { name: 'Specific days' })).toHaveAttribute('aria-pressed', 'true');
      for (const [day, on] of [
        ['Mon', 'true'],
        ['Tue', 'false'],
        ['Wed', 'true'],
        ['Thu', 'false'],
        ['Fri', 'true'],
      ] as const) {
        await expect(weekday(app, day)).toHaveAttribute('aria-pressed', on);
      }
    });

    test('turning Specific days off keeps the count and clears the chips', async ({ app }) => {
      await openPractices(app);
      await addCustom(app, 'Guitar', { weekdays: ['Tue', 'Thu', 'Sat', 'Sun'], minutes: 20 });
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Tue Thu Sat Sun · 20 min');

      await app.getByRole('button', { name: 'Edit Guitar' }).click();
      await app.getByRole('dialog').getByRole('button', { name: 'Specific days' }).click();
      await expect(app.getByRole('dialog').getByRole('group', { name: 'Weekdays' })).toHaveCount(0);
      await expect(daysGroup(app).getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();
      // Four days of 20 minutes is Steady again.
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Steady · 4 days a week · 20 min');
    });

    test('the minutes run from 1 to 600', async ({ app }) => {
      await openPractices(app);
      await app.getByRole('button', { name: 'Add practice' }).click();
      const dialog = app.getByRole('dialog', { name: 'Add practice' });
      await dialog.getByLabel('Name').fill('Guitar');
      await pickTemplate(app, 'Custom');
      const save = dialog.getByRole('button', { name: 'Save' });
      for (const [value, ok] of [
        ['0', false],
        ['601', false],
        ['', false],
        ['1', true],
        ['600', true],
      ] as const) {
        await minutesField(app).fill(value);
        if (ok) await expect(save).toBeEnabled();
        else await expect(save).toBeDisabled();
      }
    });
  });

  test('a paused practice is dimmed and listed last', async ({ app }) => {
    await openPractices(app);
    await addPractice(app, 'Guitar');
    await addPractice(app, 'Drawing');
    await addPractice(app, 'Spanish');
    const rows = app.getByRole('button', { name: /^Edit / });
    await expect(rows).toHaveText([/Guitar/, /Drawing/, /Spanish/]);

    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await pickTemplate(app, 'Paused');
    await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();

    await expect(rows).toHaveText([/Drawing/, /Spanish/, /Guitar/]);
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Paused');
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toHaveAttribute('data-paused', 'true');
    await expect(app.getByRole('button', { name: 'Edit Drawing' })).toHaveAttribute('data-paused', 'false');

    // Un-pausing puts it back where it was.
    await app.getByRole('button', { name: 'Edit Guitar' }).click();
    await pickTemplate(app, 'Light');
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
    await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('Minimal · 1 day a week · 10 min');
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

    test('picking a practice presets the Timed length to its minutes a day', async ({ app }) => {
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

    test('a Custom practice presets the Timed length to its own minutes', async ({ app }) => {
      await openPractices(app);
      await addCustom(app, 'Chess', { weekdays: ['Sat'], minutes: 45 });
      await app.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
      await pickFor(app, 'Chess');
      await expect(app.getByRole('spinbutton', { name: 'Custom minutes' })).toHaveValue('45');
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
      await expect(picker).toHaveValue((await picker.locator('option', { hasText: 'Guitar' }).getAttribute('value')) ?? '');
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
      await expect(app.getByRole('button', { name: 'Edit Guitar' }).getByTestId('practice-next-step')).toHaveText('Next: Learn the intro');
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
      // Days times minutes: 4 x 20 + 3 x 15.
      await expect(app.getByTestId('planned')).toHaveText('Planned 2h 5m a week · no cap');
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
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 20m a week · cap 8h');

      await app.reload();
      await openPractices(app);
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 20m a week · cap 8h');

      await setCap(app, 8.5);
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 20m a week · cap 8h 30m');

      await app.getByRole('button', { name: 'Change cap' }).click();
      await app.getByRole('dialog', { name: 'Weekly cap' }).getByRole('button', { name: 'Remove cap' }).click();
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 20m a week · no cap');
    });

    test('a template that would pass the cap is disabled, and says why', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 2.5); // 125 of 150 planned

      await app.getByRole('button', { name: 'Add practice' }).click();
      await expect(template(app, 'Serious')).toBeDisabled(); // 305
      await expect(template(app, 'Steady')).toBeDisabled(); // 205
      await expect(template(app, 'Light')).toBeDisabled(); // 170
      await expect(template(app, 'Minimal')).toBeEnabled(); // 135
      await expect(template(app, 'Paused')).toBeEnabled();
      await expect(template(app, 'Custom')).toBeEnabled();
      // Steady does not fit, so the new practice starts at the most that does.
      await expect(template(app, 'Minimal')).toHaveAttribute('aria-pressed', 'true');
      await expect(app.getByTestId('cap-warning')).toHaveText('Over your 2h 30m cap by 20m. Lower another practice or raise the cap.');
    });

    test('only Paused is left for a third practice when the plan is already over a 2h cap', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 2); // 125 of 120 planned
      await app.getByRole('button', { name: 'Add practice' }).click();
      await expect(template(app, 'Serious')).toBeDisabled();
      await expect(template(app, 'Minimal')).toBeDisabled();
      await expect(template(app, 'Paused')).toBeEnabled();
      await expect(template(app, 'Paused')).toHaveAttribute('aria-pressed', 'true');
      await expect(app.getByTestId('cap-warning')).toHaveText('Over your 2h cap by 15m. Lower another practice or raise the cap.');
    });

    test('lowering the cap below the plan warns in the header and changes nothing', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 8);
      await expect(app.getByTestId('over-cap')).toHaveCount(0);
      await setCap(app, 2);
      await expect(app.getByTestId('over-cap')).toHaveText('Over cap by 5m');
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('4 days a week · 20 min');
      await expect(app.getByRole('button', { name: 'Edit Drawing' })).toContainText('3 days a week · 15 min');
    });

    test('an edited practice can keep or lower its cost over the cap, but not raise it', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 2);

      await app.getByRole('button', { name: 'Edit Drawing' }).click();
      await expect(template(app, 'Light')).toBeEnabled();
      await expect(template(app, 'Minimal')).toBeEnabled();
      await expect(template(app, 'Steady')).toBeDisabled();
      await pickTemplate(app, 'Minimal');
      await app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' }).click();
      // 80 + 10 = 90 of 120.
      await expect(app.getByTestId('planned')).toHaveText('Planned 1h 30m a week · cap 2h');
      await expect(app.getByTestId('over-cap')).toHaveCount(0);

      // Raising Drawing back to Light (80 + 45 = 125) is over the cap again.
      await app.getByRole('button', { name: 'Edit Drawing' }).click();
      await expect(template(app, 'Light')).toBeDisabled();
      await expect(app.getByTestId('cap-warning')).toHaveText('Over your 2h cap by 5m. Lower another practice or raise the cap.');
    });

    test('with no cap every template is open', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Serious');
      await app.getByRole('button', { name: 'Add practice' }).click();
      await expect(template(app, 'Serious')).toBeEnabled();
      await expect(app.getByTestId('cap-warning')).toHaveCount(0);
    });

    test('a Custom target over the cap shows the warning and blocks Save', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      await setCap(app, 2.5); // 125 of 150 planned

      await app.getByRole('button', { name: 'Add practice' }).click();
      const dialog = app.getByRole('dialog', { name: 'Add practice' });
      await dialog.getByLabel('Name').fill('Chess');
      await pickTemplate(app, 'Custom'); // from Minimal: 1 day, 10 minutes
      const save = dialog.getByRole('button', { name: 'Save' });
      await expect(save).toBeEnabled();

      // 7 x 10 = 70 on top of 125 is 45 over.
      await daysGroup(app).getByRole('button', { name: '7', exact: true }).click();
      await expect(save).toBeDisabled();
      await expect(app.getByTestId('cap-warning')).toHaveText('Over your 2h 30m cap by 45m. Lower another practice or raise the cap.');

      // 125 + 2 x 10 fits. 2 x 13 is 1 over.
      await daysGroup(app).getByRole('button', { name: '2', exact: true }).click();
      await expect(save).toBeEnabled();
      await minutesField(app).fill('13');
      await expect(save).toBeDisabled();
      await expect(app.getByTestId('cap-warning')).toHaveText('Over your 2h 30m cap by 1m. Lower another practice or raise the cap.');
    });

    test('a Custom target over the cap can be kept or lowered, but not raised', async ({ app }) => {
      await openPractices(app);
      await addCustom(app, 'Guitar', { days: 7, minutes: 60 }); // 420 a week
      await setCap(app, 2);

      await app.getByRole('button', { name: 'Edit Guitar' }).click();
      const save = app.getByRole('dialog', { name: 'Edit practice' }).getByRole('button', { name: 'Save' });
      // Unchanged is allowed, though it is over the cap.
      await expect(save).toBeEnabled();
      await minutesField(app).fill('61');
      await expect(save).toBeDisabled();
      await minutesField(app).fill('59');
      await expect(save).toBeEnabled();
      await save.click();
      await expect(app.getByRole('button', { name: 'Edit Guitar' })).toContainText('7 days a week · 59 min');
    });
  });

  test.describe('needs attention', () => {
    const card = (page: Page) => page.getByRole('region', { name: 'Needs attention' });

    /** Run a Timed session for a practice to its end and skip the next-step question. */
    async function timedSession(page: Page, name: string, minutes: number) {
      await pickFor(page, name);
      await startTimed(page, minutes);
      await advance(page, minutes * MIN);
      await page
        .getByRole('dialog', { name: `Next step for ${name}` })
        .getByRole('button', { name: 'Skip' })
        .click();
    }

    test('is not there without practices, or when none is behind', async ({ app }) => {
      await expect(card(app)).toHaveCount(0);
      await openPractices(app);
      await addPractice(app, 'Spanish', 'Minimal');
      await addPractice(app, 'Guitar', 'Paused');
      await expect(card(app)).toBeVisible();
      await timedSession(app, 'Spanish', 10);
      // The one day a week is done, and Paused has no target.
      await expect(card(app)).toHaveCount(0);
    });

    test('lists the three furthest behind, most days left first, leaving out Paused', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Chess', 'Minimal');
      await addPractice(app, 'Spanish', 'Minimal');
      await addPractice(app, 'Drawing', 'Light');
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Piano', 'Paused');
      await expect(card(app).getByRole('button')).toHaveText([
        'Guitar · 0 of 4 days this week · 7 days left',
        'Drawing · 0 of 3 days this week · 7 days left',
        'Chess · 0 of 1 day this week · 7 days left',
      ]);
    });

    test('counts a day by the minutes added up, and the days left', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await timedSession(app, 'Guitar', 19); // under 20 minutes
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 0 of 4 days this week · 7 days left');
      await timedSession(app, 'Guitar', 1); // 20 minutes in the day
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 1 of 4 days this week · 7 days left');

      // Friday has three days left, Sunday one. The week's count stays until Monday.
      await advance(app, 4 * 24 * 60 * MIN);
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 1 of 4 days this week · 3 days left');
      await advance(app, 2 * 24 * 60 * MIN);
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 1 of 4 days this week · 1 day left');
      await advance(app, 24 * 60 * MIN);
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 0 of 4 days this week · 7 days left');
    });

    test('minutes on different days do not add up', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await timedSession(app, 'Guitar', 19);
      await advance(app, 24 * 60 * MIN);
      await timedSession(app, 'Guitar', 19);
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 0 of 4 days this week · 6 days left');
    });

    test('a Flow stretch and a Timed session on one day add up', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await pickFor(app, 'Guitar');
      await startState(app, 'Focus');
      await advance(app, 12 * MIN);
      await app.getByRole('button', { name: 'Stop' }).click();
      await app.getByRole('dialog', { name: 'Next step for Guitar' }).getByRole('button', { name: 'Skip' }).click();
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 0 of 4 days this week · 7 days left');

      await timedSession(app, 'Guitar', 8);
      await expect(card(app).getByRole('button')).toHaveText('Guitar · 1 of 4 days this week · 7 days left');
    });

    test('chosen weekdays decide the days left, falling back to the rest of the week', async ({ app }) => {
      await openPractices(app);
      await addCustom(app, 'Guitar', { weekdays: ['Mon', 'Wed', 'Fri'], minutes: 30 });
      const button = card(app).getByRole('button');
      await expect(button).toHaveText('Guitar · 0 of 3 days this week · 3 days left'); // Monday
      await advance(app, 24 * 60 * MIN);
      await expect(button).toHaveText('Guitar · 0 of 3 days this week · 2 days left'); // Tuesday: Wed, Fri
      await advance(app, 2 * 24 * 60 * MIN);
      await expect(button).toHaveText('Guitar · 0 of 3 days this week · 1 day left'); // Thursday: Fri
      await advance(app, 2 * 24 * 60 * MIN);
      await expect(button).toHaveText('Guitar · 0 of 3 days this week · 2 days left'); // Saturday: none chosen left, so Sat and Sun
    });

    test('a practice due today comes first, until today is done', async ({ app }) => {
      await openPractices(app);
      await addCustom(app, 'Chess', { weekdays: ['Fri', 'Sat'], minutes: 20 });
      await addPractice(app, 'Guitar', 'Steady');
      // Friday: Guitar is further behind (4 left in 3 days), but Chess is due today (2 left in 2 days).
      await advance(app, 4 * 24 * 60 * MIN);
      await expect(card(app).getByRole('button')).toHaveText(['Chess · 0 of 2 days this week · 2 days left', 'Guitar · 0 of 4 days this week · 3 days left']);

      await timedSession(app, 'Chess', 20);
      await expect(card(app).getByRole('button')).toHaveText(['Guitar · 0 of 4 days this week · 3 days left', 'Chess · 1 of 2 days this week · 2 days left']);
    });

    test('tapping one picks it for the next session, and starts nothing', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await addPractice(app, 'Drawing', 'Light');
      const picker = app.getByLabel('For', { exact: true });
      await expect(picker).toHaveValue('');

      await card(app)
        .getByRole('button', { name: /^Drawing/ })
        .click();
      await expect(picker.locator('option:checked')).toHaveText('Drawing');
      await expect(card(app).getByRole('button', { name: /^Drawing/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(card(app).getByRole('button', { name: /^Guitar/ })).toHaveAttribute('aria-pressed', 'false');
      await expect(app.getByText('Stopped')).toBeVisible();

      // Timed starts at its minutes a day, as when picked from the list.
      await app.getByRole('group', { name: 'Timer mode' }).getByRole('button', { name: 'Timed' }).click();
      await expect(app.getByRole('spinbutton', { name: 'Custom minutes' })).toHaveValue('15');
      await card(app)
        .getByRole('button', { name: /^Guitar/ })
        .click();
      await expect(app.getByRole('spinbutton', { name: 'Custom minutes' })).toHaveValue('20');
    });

    test('goes while a session runs, and comes back when it stops', async ({ app }) => {
      await openPractices(app);
      await addPractice(app, 'Guitar', 'Steady');
      await card(app)
        .getByRole('button', { name: /^Guitar/ })
        .click();
      await startState(app, 'Focus');
      await expect(card(app)).toHaveCount(0);
      await advance(app, MIN);
      await app.getByRole('button', { name: 'Stop' }).click();
      await app.getByRole('dialog', { name: 'Next step for Guitar' }).getByRole('button', { name: 'Skip' }).click();
      await expect(card(app)).toBeVisible();
    });
  });
});
