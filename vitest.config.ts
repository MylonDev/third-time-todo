import { defineConfig } from 'vitest/config';

/**
 * Unit tests cover the pure logic — date keys, the bank, store migrations.
 * Anything that needs a browser stays in `e2e/` under Playwright.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
