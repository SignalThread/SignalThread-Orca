import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_REAL_BASE_URL || 'http://127.0.0.1:3101'

export default defineConfig({
  testDir: './e2e-real',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-real' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run storage:dev',
      url: 'http://127.0.0.1:9000/minio/health/ready',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    ...(process.env.PLAYWRIGHT_REAL_BASE_URL ? [] : [{
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3101',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          // External AI is intentionally unavailable in this suite. The real
          // answer route must persist its deterministic fallback instead.
          OPENAI_API_KEY: '',
          EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS: '1',
          EVENTS_TEST_TRANSCRIPT: 'The room was comfortable but registration lines were long.',
          NEXT_DIST_DIR: '.next-playwright-real',
        },
      }]),
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
