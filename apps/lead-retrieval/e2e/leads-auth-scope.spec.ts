import { randomUUID } from "crypto";
import { test, expect } from "@playwright/test";
import { createAuthUser, deleteAuthUser, SERVICE_KEY } from "./helpers/supabase";
import { LOGIN_ORIGIN, seedCookiesViaPasswordGrant } from "./helpers/playwright-session";

/**
 * Regression: invite-only / pre-provisioning users exist in auth but not in public.users.
 * They must not reach exhibitor lead surfaces (middleware + session invariants; unchanged by admin users-table merge).
 *
 * Fully provisioned exhibitor happy path remains in e2e/leads.spec.ts.
 */
test.describe("exhibitor leads — auth without public.users", () => {
  test.skip(!SERVICE_KEY, "Requires SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local)");

  test.use({ storageState: { cookies: [], origins: [] } });

  test("auth-only user is blocked from /exhibitor/leads (no profile row)", async ({ browser }) => {
    const email = `playwright-authonly-${randomUUID()}@test.com`;
    const password = "PW_test_LeadIntel_2026!Secure";
    const userId = await createAuthUser(email, password);

    try {
      const cookies = await seedCookiesViaPasswordGrant(email, password);
      const context = await browser.newContext();
      await context.addCookies(cookies);

      const page = await context.newPage();
      await page.goto(`${LOGIN_ORIGIN}/exhibitor/leads`);
      await expect(page).toHaveURL(/\/login(?:\?error=role)?$/, { timeout: 15_000 });

      await context.close();
    } finally {
      await deleteAuthUser(userId);
    }
  });
});
