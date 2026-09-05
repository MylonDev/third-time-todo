import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

/**
 * Colours and shadows come from tokens in index.css, defined once for dark and
 * again for light. A literal in a component is caught statically by the
 * no-restricted-syntax rule in eslint.config.js; what can only be checked here
 * is that both themes actually define everything, and that the tokens reach
 * the pixels.
 */
const TOKENS = [
  '--color-bg', '--color-surface', '--color-surface-2', '--color-border',
  '--color-text', '--color-text-muted',
  '--color-accent', '--color-accent-dim', '--color-accent-deep',
  '--color-rest', '--color-rest-dim', '--color-rest-edge',
  '--color-debt', '--color-debt-dim', '--color-debt-edge',
  '--color-on-accent', '--shadow-raised', '--shadow-overlay',
];

/**
 * Tokens that must be re-stated under `.light`. Anything left to inherit the
 * dark value is a token someone forgot, and it shows as the wrong colour on a
 * light ground. `--color-on-accent` is deliberately white in both.
 */
const MUST_DIFFER = TOKENS.filter((t) => t !== '--color-on-accent');

const setTheme = (page: Page, theme: 'dark' | 'light') =>
  page.evaluate((t) => document.documentElement.classList.toggle('light', t === 'light'), theme);

const tokenValues = (page: Page) =>
  page.evaluate((tokens) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(tokens.map((t) => [t, style.getPropertyValue(t).trim()]));
  }, TOKENS);

test('both themes define every token, and define them differently', async ({ app }) => {
  await setTheme(app, 'dark');
  const dark = await tokenValues(app);
  await setTheme(app, 'light');
  const light = await tokenValues(app);

  for (const token of TOKENS) {
    expect(dark[token], `${token} is undefined in the dark theme`).not.toBe('');
    expect(light[token], `${token} is undefined in the light theme`).not.toBe('');
  }
  for (const token of MUST_DIFFER)
    expect(light[token], `${token} has no .light override — it inherits the dark value`)
      .not.toBe(dark[token]);
});

test('the focus ring is painted from the accent token, in both themes', async ({ app }) => {
  const input = app.getByPlaceholder('Add a task…');
  await input.fill('Focused');
  await input.press('Enter');
  await app.getByRole('button', { name: 'Start →' }).click();
  const row = app.locator('li').filter({ hasText: 'Focused' }).first();
  await row.click();
  await expect(row).toContainText('Tracked');

  for (const theme of ['dark', 'light'] as const) {
    await setTheme(app, theme);
    const [shadow, accentDim] = await Promise.all([
      row.evaluate((e) => getComputedStyle(e).boxShadow),
      app.evaluate(() => getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent-dim').trim()),
    ]);
    // The token is authored as rgba(r, g, b, a); the computed shadow carries
    // the same channels. Compare the numbers rather than the formatting.
    const channels = accentDim.match(/[\d.]+/g)?.slice(0, 3) ?? [];
    expect(channels.length, `--color-accent-dim is not an rgb() value: ${accentDim}`).toBe(3);
    for (const c of channels)
      expect(shadow, `${theme}: focus ring does not use --color-accent-dim (${shadow})`)
        .toContain(c);
  }
});
