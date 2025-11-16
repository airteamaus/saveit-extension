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
  ],
  webServer: {
    command: 'python3 -m http.server 8080',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  }
});
