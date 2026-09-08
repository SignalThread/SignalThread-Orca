import { test as setup, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

import {
  LOGIN_ORIGIN,
  fetchCookiesViaE2eAuthBypass,
  seedCookiesViaPasswordGrant
} from "./helpers/playwright-session";

const STORAGE_TIMEOUT_MS = 60_000;

/** Must stay aligned with `lib/e2e/e2e-seeded-auth-emails.ts` (case-insensitive). */
const ACCOUNTS = [
  { role: "platform_admin", email: "Playwright-PA@test.com" },
  { role: "organizer_admin", email: "playwright-OA@test.com" },
  { role: "exhibitor_admin", email: "playwright-ea@test.com" }
];

/** OTP-era: `/api/e2e/auth-bypass` when enabled + non-production; else anon password grant. */
const USE_E2E_AUTH_BYPASS = process.env.E2E_AUTH_BYPASS_ENABLED === "true";

/**
 * After cookies are seeded, hitting the live app verifies middleware/session wiring matches prod.
 */
async function waitForSupabaseBrowserSessionCookies(page: Page) {
  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies(LOGIN_ORIGIN);
        return cookies.some(
          (c) =>
            c.name.startsWith("sb-") &&
            (c.name.includes("auth") || c.name.includes("access")) &&
            c.value != null &&
            c.value.length > 0
        );
      },
      {
        timeout: STORAGE_TIMEOUT_MS,
        message: "Expected Supabase auth cookies (sb-*) readable in the browser context"
      }
    )
    .toBe(true);
}

setup.describe("auth setup", () => {
  ACCOUNTS.forEach(({ role, email }) => {
    setup(`seed session as ${role}`, async ({ browser }) => {
      const cookies = USE_E2E_AUTH_BYPASS
        ? await fetchCookiesViaE2eAuthBypass(email)
        : await seedCookiesViaPasswordGrant(email, "PW_test_LeadIntel_2026!Secure");

      const context = await browser.newContext();
      await context.addCookies(cookies);

      const page = await context.newPage();
      await page.goto(`${LOGIN_ORIGIN}/login`);

      await waitForSupabaseBrowserSessionCookies(page);

      if (role === "platform_admin") {
        await page.waitForURL(/\/admin/);
        await expect(page).toHaveURL(/\/admin/);
      } else if (role === "organizer_admin") {
        await page.waitForURL(/\/app\/organizer/);
        await expect(page).toHaveURL(/\/app\/organizer/);
      } else if (role === "exhibitor_admin") {
        await expect(page).not.toHaveURL(/\/login/, { timeout: STORAGE_TIMEOUT_MS });
      }

      const storagePath = path.join(process.cwd(), `e2e/storage/${role}.json`);
      if (!fs.existsSync(path.dirname(storagePath))) {
        fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      }

      await context.storageState({ path: storagePath });
      await context.close();
    });
  });
});
