import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results']),
  {
    // The app. React rules apply here and nowhere else.
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // The end-to-end suite. Node, no React — Playwright's fixtures take a
    // parameter called `use`, which the rules-of-hooks rule reads as a hook.
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Colours and shadows belong in the tokens in src/index.css, which are
    // defined for both themes. A literal here looks right in whichever theme
    // it was written against and wrong in the other.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: String.raw`Literal[value=/(#[0-9a-fA-F]{3,8}\b|\brgba?\()/]`,
          message:
            'Use a design token from src/index.css (var(--color-…) / var(--shadow-…)) rather than a literal colour.',
        },
        {
          selector: String.raw`TemplateElement[value.raw=/(#[0-9a-fA-F]{3,8}\b|\brgba?\()/]`,
          message:
            'Use a design token from src/index.css (var(--color-…) / var(--shadow-…)) rather than a literal colour.',
        },
      ],
    },
  },
])
