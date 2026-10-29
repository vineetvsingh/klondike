import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;
// Locally you can reuse an installed browser, e.g. PW_CHANNEL=msedge; CI uses Playwright's Chromium.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 2, // each page runs real animation and a solver worker; more in parallel starves the CPU
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel ? { channel } : {}),
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 820 },
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    {
      name: 'phone',
      testMatch: /mobile\.spec/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
