import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Limit workers to 2 to avoid parallel execution race conditions
  // Tests pass reliably at workers=1 (serial) but timeout intermittently at workers=5
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  timeout: 30000, // 30s per test (default)
  // The real-extension warming tests run headed Chromium under xvfb on CI
  // (no GPU, software rendering), and CI retries failed tests twice — the
  // original 2-minute global cap was too tight and aborted the suite mid-run.
  globalTimeout: process.env.CI ? 600000 : 120000,
  use: {
    trace: 'on-first-retry',
    headless: !!process.env.CI
  },
  projects: [
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'xpinstall.signatures.required': false
          }
        }
      },
    }
  ]
});
