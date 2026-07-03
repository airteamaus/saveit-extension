import { defineConfig } from '@playwright/test';

// Separate config for Chromium extension-mode E2E tests (the warming flow needs
// a real loaded extension, which only Chromium supports via --load-extension).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /warming-flow\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    headless: false, // Chromium extensions require headed (or new headless) mode
    actionTimeout: 15000
  },
  projects: [
    { name: 'chromium' }
  ]
});
