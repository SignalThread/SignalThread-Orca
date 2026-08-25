import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const devUserEmail =
  process.env.PW_E2E_DEV_USER_EMAIL ??
  `planner-e2e-${process.pid}@planner.test`;
const e2eVerboseLogs = process.env.PW_E2E_VERBOSE_LOGS ?? "0";
const productionAvailabilityRun = process.env.PW_E2E_PRODUCTION_AVAILABILITY ?? "false";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "true"
    ? undefined
    : {
        // The production-availability project renders the production-safe
        // feature gates in the authenticated local harness. A real production
        // build remains a separate release check; production auth must never be
        // weakened merely to make browser fixtures sign in.
        command: `env -u NO_COLOR npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          DEV_USER_EMAIL: devUserEmail,
          PW_E2E: "1",
          PW_E2E_DEV_USER_EMAIL: devUserEmail,
          PW_E2E_VERBOSE_LOGS: e2eVerboseLogs,
          NEXT_PUBLIC_PW_E2E_PRODUCTION_AVAILABILITY: productionAvailabilityRun,
          NEXT_PUBLIC_BUDGET_DEBUG_LOGS: e2eVerboseLogs,
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
