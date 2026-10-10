import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: {timeout: 10_000},
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    browserName: 'chromium',
    // Keep both rows of page cards visible during native HTML drag gestures.
    viewport: {width: 1440, height: 1600},
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
