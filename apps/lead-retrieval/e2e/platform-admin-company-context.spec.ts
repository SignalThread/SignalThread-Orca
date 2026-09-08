import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { supabaseDelete, supabaseGet, supabaseInsert } from "./helpers/supabase";

const ADMIN_STATE = "e2e/storage/platform_admin.json";
const EXHIBITOR_STATE = "e2e/storage/exhibitor_admin.json";
const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function postAccountContextFromBrowser(page: import("@playwright/test").Page, companyId: string) {
  await page.evaluate((id) => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/api/admin/account-context";
    const company = document.createElement("input");
    company.name = "companyId";
    company.value = id;
    form.append(company);
    document.body.append(form);
    form.submit();
  }, companyId);
  await page.waitForURL(/\/app\/events(?:\?.*)?$/);
}

test.describe("platform admin company account context", () => {
  test.use({ storageState: ADMIN_STATE });

  test("clicking Sanity.io reaches and persists in the company-facing app", async ({ page }) => {
    const navigationHistory: string[] = [];
    page.on("response", (response) => {
      if (response.request().isNavigationRequest()) {
        navigationHistory.push(`${response.request().method()} ${response.status()} ${response.url()}`);
      }
    });

    await page.goto(`${BASE_URL}/admin/company-licenses/companies`);
    const sanityRow = page.locator("tbody tr").filter({ hasText: "Sanity.io" }).first();
    await expect(sanityRow).toBeVisible();
    await sanityRow.getByRole("button", { name: /Enter Sanity\.io company account/i }).click();

    await expect(page).toHaveURL(/\/app\/events(?:\?.*)?$/);
    expect(navigationHistory.some((entry) => entry.includes("/login"))).toBe(false);
    expect(page.url()).not.toMatch(/\/admin(?:\/?|\?.*)$/);
    await expect(page.getByTestId("platform-admin-account-context-banner")).toContainText(
      "Platform Admin · Viewing Sanity.io"
    );
    await expect
      .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === "st_platform_admin_company"))
      .toBe(true);

    await page.goto(`${BASE_URL}/app/settings`);
    await expect(page.getByTestId("platform-admin-account-context-banner")).toContainText(
      "Platform Admin · Viewing Sanity.io"
    );

    await page.getByRole("button", { name: "Exit company" }).click();
    await expect(page).toHaveURL(/\/admin\/exhibitors(?:\?.*)?$/);
    await expect
      .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === "st_platform_admin_company"))
      .toBe(false);

    console.log(`[platform-admin-company-context] navigation history\n${navigationHistory.join("\n")}`);
  });

  test("preserves the platform session through enter, switch, and exit", async ({ page }) => {
    const suffix = randomUUID().slice(0, 8);
    const companyAId = randomUUID();
    const companyBId = randomUUID();
    const eventAId = randomUUID();
    const eventBId = randomUUID();
    const companyAName = `E2E Platform Context A ${suffix}`;
    const companyBName = `E2E Platform Context B ${suffix}`;
    const organizerCompanies = await supabaseGet<{ organizer_id: string }>(
      "companies",
      "select=organizer_id&limit=1"
    );
    const organizerId = organizerCompanies[0]?.organizer_id;
    if (!organizerId) throw new Error("E2E fixture requires an organizer-owned company.");
    const now = new Date().toISOString();

    try {
      await supabaseInsert("companies", { id: companyAId, name: companyAName, organizer_id: organizerId });
      await supabaseInsert("companies", { id: companyBId, name: companyBName, organizer_id: organizerId });
      await supabaseInsert("events", {
        id: eventAId,
        name: `E2E Platform Context Event A ${suffix}`,
        company_id: companyAId,
        status: "ACTIVE",
        is_active: true,
        start_date: "2026-08-10",
        end_date: "2026-08-11",
        created_at: now,
        updated_at: now
      });
      await supabaseInsert("events", {
        id: eventBId,
        name: `E2E Platform Context Event B ${suffix}`,
        company_id: companyBId,
        status: "ACTIVE",
        is_active: true,
        start_date: "2026-08-10",
        end_date: "2026-08-11",
        created_at: now,
        updated_at: now
      });

      await page.goto(`${BASE_URL}/admin`);
      await postAccountContextFromBrowser(page, companyAId);
      await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
      await expect(page.getByTestId("platform-admin-account-context-banner")).toContainText(
        `Platform Admin · Viewing ${companyAName}`
      );
      await expect(page.getByRole("heading", { name: `E2E Platform Context Event A ${suffix}`, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: `E2E Platform Context Event B ${suffix}`, exact: true })).toHaveCount(0);

      await page.goto(`${BASE_URL}/admin`);
      await postAccountContextFromBrowser(page, companyBId);
      await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
      await expect(page.getByTestId("platform-admin-account-context-banner")).toContainText(
        `Platform Admin · Viewing ${companyBName}`
      );
      await expect(page.getByRole("heading", { name: `E2E Platform Context Event B ${suffix}`, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: `E2E Platform Context Event A ${suffix}`, exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "Exit company" }).click();
      await expect(page).toHaveURL(/\/admin\/exhibitors(?:\?.*)?$/);
      await expect(page.getByTestId("platform-admin-account-context-banner")).toHaveCount(0);
      await expect
        .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === "st_platform_admin_company"))
        .toBe(false);
    } finally {
      await supabaseDelete("events", `id=in.(${eventAId},${eventBId})`).catch(() => undefined);
      await supabaseDelete("companies", `id=in.(${companyAId},${companyBId})`).catch(() => undefined);
    }
  });
});

test.describe("company account context authorization", () => {
  test.use({ storageState: EXHIBITOR_STATE });

  test("rejects an exhibitor session and leaves its normal session untouched", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/dashboard`);
    const status = await page.evaluate(async () => {
      const response = await fetch("/api/admin/account-context", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "companyId=00000000-0000-0000-0000-000000000000"
      });
      return response.status;
    });
    expect(status).toBe(403);
    await expect
      .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === "st_platform_admin_company"))
      .toBe(false);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
  });
});
