import { defineConfig, devices } from '@playwright/test'

// Keep journey tests isolated from any developer server that happens to be
// running on the conventional dev port. In particular, reusing port 3000 can
// silently exercise a different checkout with different middleware/auth code.
const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: playwrightBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
        url: playwrightBaseUrl,
        reuseExistingServer: false,
        timeout: 120_000,
        env: { ...process.env, NEXT_DIST_DIR: '.next-playwright-mocked' },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
