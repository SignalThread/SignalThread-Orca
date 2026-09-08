import { test, expect } from "@playwright/test";
import { EXHIBITOR_ZONE_RE } from "./helpers/exhibitor-navigation";

/**
 * When the dev server is not running, navigation fails with connection errors —
 * skip these tests so results are not misread as auth/regression failures.
 */
let devServerReachable = true;
test.beforeAll(async ({ request }) => {
  try {
    await request.get("http://localhost:3000/", { timeout: 10_000, failOnStatusCode: false });
  } catch {
    devServerReachable = false;
  }
});
test.beforeEach(() => {
  test.skip(!devServerReachable, "Dev server not reachable at http://localhost:3000 (connection refused / blocked port)");
});

test.describe("exhibitor auth", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test("exhibitor session leaves platform /admin root (resolver may send to login or exhibitor)", async ({
    page
  }) => {
    await page.goto("http://localhost:3000/admin");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/(login|(app\/)?exhibitor)/, { timeout: 25_000 });
  });

  test("exhibitor cannot access company-scoped admin dashboard", async ({ page }) => {
    await page.goto("http://localhost:3000/admin/company-licenses");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/admin\/company-licenses/);
  });
});

test.describe("platform auth", () => {
  test.use({ storageState: "e2e/storage/platform_admin.json" });

  test("platform admin can access admin", async ({ page }) => {
    await page.goto("http://localhost:3000/admin");
    await expect(page).toHaveURL(/\/admin/);
  });

  test("platform admin can access company-scoped dashboard routes and existing event routes", async ({ page }) => {
    await page.goto("http://localhost:3000/admin/company-licenses");
    await expect(page).toHaveURL(/\/admin\/company-licenses$/);
    await expect(page.getByRole("heading", { name: /^Overview$/i })).toBeVisible({ timeout: 20_000 });

    await page.goto("http://localhost:3000/admin/events");
    await expect(page).toHaveURL(/\/admin\/events$/);
    await expect(page.getByRole("heading", { name: /^Events$/i })).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("organizer auth", () => {
  test.use({ storageState: "e2e/storage/organizer_admin.json" });

  test("organizer cannot access admin", async ({ page }) => {
    await page.goto("http://localhost:3000/admin");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test("organizer cannot access company-scoped admin dashboard", async ({ page }) => {
    await page.goto("http://localhost:3000/admin/company-licenses");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/admin\/company-licenses/);
  });
});

test.describe("organizer access", () => {
  test.use({ storageState: "e2e/storage/organizer_admin.json" });

  test("organizer can access organizer dashboard", async ({ page }) => {
    await page.goto("http://localhost:3000/app/organizer");
    await expect(page).toHaveURL(/organizer/);
  });
});

test.describe("exhibitor access", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test("exhibitor session shows dashboard UI from /exhibitor/dashboard", async ({ page }) => {
    await page.goto("http://localhost:3000/exhibitor/dashboard");
    await expect(page.getByRole("heading", { name: /^Dashboard$/i })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(EXHIBITOR_ZONE_RE);
  });
});
