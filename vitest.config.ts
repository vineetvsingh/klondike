import { defineConfig } from 'vitest/config';

// Unit tests only; the browser tests in tests/e2e run under Playwright.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
