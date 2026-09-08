import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  cleanupTestUser,
  createAuthUser,
  deleteAuthUser,
  resolveTestExhibitorContext,
  supabaseDelete,
  supabaseGet,
  supabaseInsert
} from "./helpers/supabase";

const BASE = "http://localhost:3000";
const ADMIN_STATE = "e2e/storage/platform_admin.json";

test.describe("admin /users", () => {
  test.use({ storageState: ADMIN_STATE });

  test("filter row: role + status comboboxes, no legacy event-count pill", async ({ page }) => {
    await page.goto(`${BASE}/admin/users`);
    await expect(page.getByRole("combobox", { name: /filter by role/i })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /filter by status/i })).toBeVisible();
    await expect(page.getByText(/\d+\s+users\s+in\s+/i)).toHaveCount(0);
  });

  test("role filter narrows table vs all roles (client-side)", async ({ page }) => {
    await page.goto(`${BASE}/admin/users`);
    await page.getByRole("combobox", { name: /filter by role/i }).selectOption("all");
    const rowsAll = await page.locator("tbody tr").count();
    await page.getByRole("combobox", { name: /filter by role/i }).selectOption("platform_admin");
    const rowsPa = await page.locator("tbody tr").count();
    expect(rowsPa).toBeLessThanOrEqual(rowsAll);
  });

  test("selected event does not hide platform admins without event membership", async ({ page }) => {
    const email = `e2e-platform-wide-${Date.now()}@test.com`;
    let userId: string | null = null;

    await cleanupTestUser(email);

    try {
      userId = await createAuthUser(email, "Password123!");
      await supabaseInsert("users", {
        id: userId,
        email,
        full_name: "E2E Platform Wide",
        role: "platform_admin",
        company_id: null
      });

      await page.goto(`${BASE}/admin/users`);
      await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });

      await page.getByRole("combobox", { name: /filter by role/i }).selectOption("platform_admin");
      const seededRow = page.locator("tbody tr").filter({ hasText: email });
      await expect(seededRow).toHaveCount(1);
      await expect(seededRow).toContainText("Platform-wide");

      await page.getByRole("combobox", { name: /filter by role/i }).selectOption("all");
      await expect(seededRow).toHaveCount(1);
    } finally {
      await cleanupTestUser(email).catch(() => {});
      if (userId) {
        await deleteAuthUser(userId).catch(() => {});
      }
    }
  });

  test("row actions use destructive-styled delete control", async ({ page }) => {
    await page.goto(`${BASE}/admin/users`);
    await expect(page.getByRole("button", { name: /delete user/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("event selection recomputes visible rows without retaining stale company-wide data", async ({ page }) => {
    const suffix = randomUUID().slice(0, 8);
    const ctx = await resolveTestExhibitorContext();
    const eventAId = ctx.eventId;
    const eventBId = randomUUID();
    const companyBId = randomUUID();
    const userAEmail = `e2e-users-event-a-${suffix}@test.com`;
    const userBEmail = `e2e-users-event-b-${suffix}@test.com`;
    const userAName = `E2E Users Event A ${suffix}`;
    const userBName = `E2E Users Event B ${suffix}`;
    let userAId: string | null = null;
    let userBId: string | null = null;

    try {
      const hostCompanies = await supabaseGet<{ organizer_id: string }>(
        "companies",
        `id=eq.${ctx.companyId}&select=organizer_id`
      );
      const organizerId = hostCompanies[0]?.organizer_id;
      if (!organizerId) throw new Error("E2E host company is missing organizer_id.");

      userAId = await createAuthUser(userAEmail, "Password123!");
      userBId = await createAuthUser(userBEmail, "Password123!");
      const now = new Date().toISOString();

      await supabaseInsert("companies", {
        id: companyBId,
        name: `E2E Users Company B ${suffix}`,
        organizer_id: organizerId
      });
      await supabaseInsert("events", {
        id: eventBId,
        name: `E2E Users Event B ${suffix}`,
        company_id: ctx.companyId,
        status: "ACTIVE",
        is_active: true,
        start_date: "2026-08-10",
        end_date: "2026-08-11",
        created_at: now,
        updated_at: now
      });
      await supabaseInsert("exhibitors", {
        event_id: eventBId,
        company_id: companyBId,
        status: "active",
        created_at: now,
        updated_at: now
      });
      await supabaseInsert("users", {
        id: userAId,
        email: userAEmail,
        full_name: userAName,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId
      });
      await supabaseInsert("users", {
        id: userBId,
        email: userBEmail,
        full_name: userBName,
        role: "event_organizer",
        company_id: companyBId
      });
      await supabaseInsert("event_users", {
        event_id: eventAId,
        user_id: userAId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: true, app: true },
        created_at: now
      });
      await supabaseInsert("event_users", {
        event_id: eventBId,
        user_id: userBId,
        exhibitor_company_id: companyBId,
        status: "active",
        permissions: { admin: false, app: true },
        created_at: now
      });

      await page.goto(`${BASE}/admin/users`);
      const eventSelect = page.getByRole("combobox", { name: /filter by event/i });
      const roleSelect = page.getByRole("combobox", { name: /filter by role/i });
      const exhibitorSelect = page.getByRole("combobox", { name: /filter by exhibitor/i });
      const search = page.getByPlaceholder(/search users by name or email/i);
      const rowA = page.locator("tbody tr").filter({ hasText: userAEmail });
      const rowB = page.locator("tbody tr").filter({ hasText: userBEmail });

      // Default All events includes both event memberships.
      await expect(eventSelect).toHaveValue("__all_events__");
      await expect(rowA).toHaveCount(1);
      await expect(rowB).toHaveCount(1);

      // Event A excludes Event B; Event B then excludes Event A.
      await eventSelect.selectOption(eventAId);
      await expect(rowA).toHaveCount(1);
      await expect(rowB).toHaveCount(0);
      await eventSelect.selectOption(eventBId);
      await expect(rowA).toHaveCount(0);
      await expect(rowB).toHaveCount(1);

      // All events restores the complete scope.
      await eventSelect.selectOption("__all_events__");
      await expect(rowA).toHaveCount(1);
      await expect(rowB).toHaveCount(1);

      // Event selection composes with role, exhibitor, and search predicates.
      await eventSelect.selectOption(eventAId);
      await roleSelect.selectOption("exhibitor_admin");
      await expect(rowA).toHaveCount(1);
      await expect(rowB).toHaveCount(0);
      await roleSelect.selectOption("all");

      await eventSelect.selectOption(eventBId);
      await exhibitorSelect.selectOption(companyBId);
      await expect(rowB).toHaveCount(1);
      await exhibitorSelect.selectOption("all");

      await eventSelect.selectOption(eventAId);
      await search.fill(userAEmail);
      await expect(rowA).toHaveCount(1);
      await expect(rowB).toHaveCount(0);
      await search.fill("");

      // Sequential selections must end with only the final event's rows.
      await eventSelect.selectOption(eventAId);
      await eventSelect.selectOption(eventBId);
      await eventSelect.selectOption(eventAId);
      await eventSelect.selectOption(eventBId);
      await expect(rowA).toHaveCount(0);
      await expect(rowB).toHaveCount(1);
    } finally {
      for (const userId of [userAId, userBId].filter(Boolean) as string[]) {
        await supabaseDelete("event_users", `user_id=eq.${userId}`).catch(() => {});
        await supabaseDelete("users", `id=eq.${userId}`).catch(() => {});
        await deleteAuthUser(userId).catch(() => {});
      }
      await supabaseDelete("exhibitors", `event_id=eq.${eventBId}`).catch(() => {});
      await supabaseDelete("events", `id=eq.${eventBId}`).catch(() => {});
      await supabaseDelete("companies", `id=eq.${companyBId}`).catch(() => {});
      await cleanupTestUser(userAEmail).catch(() => {});
      await cleanupTestUser(userBEmail).catch(() => {});
    }
  });
});
