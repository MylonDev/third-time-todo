import { defineConfig, devices } from '@playwright/test';

/**
 * The app is entirely client-side and stores everything in localStorage, so
 * these run against the real dev server with no fixtures or seeding beyond
 * what each spec does through the UI.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://localhost:5173/third-time-todo/',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/third-time-todo/',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});
