import { defineConfig } from '@playwright/test';

// We don't use Playwright's bundled Chromium (it adds a ~250MB download we can
// avoid). Instead we drive the user's installed Chrome via `channel: 'chrome'`.
// Extension-loading is done in tests via `chromium.launchPersistentContext`
// with --load-extension args.

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false, // extension-loading needs single-context per worker
  workers: 1,
  reporter: [['list']],
  use: {
    headless: false, // MV3 service workers don't run reliably in headless mode
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
