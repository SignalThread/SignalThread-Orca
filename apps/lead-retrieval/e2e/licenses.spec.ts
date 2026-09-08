import { createHash, randomUUID } from "node:crypto";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  supabaseGet,
  supabaseInsert,
  supabasePatch,
  supabaseDelete,
  createAuthUser,
  deleteAuthUser,
  cleanupTestUser,
  countActiveAppUsers,
  resolveTestExhibitorContext,
  ensureOrganizerInviteTestFixture,
  PLAYWRIGHT_EXHIBITOR_EMAIL,
  type TestExhibitorContext,
  type OrganizerInviteTestContext,
} from "./helpers/supabase";
import {
  acquireLicenseSeatLock,
  releaseLicenseSeatLock,
} from "./helpers/license-seat-lock";

const BASE = "http://localhost:3000";
const ADMIN_STATE = "e2e/storage/platform_admin.json";
const EXHIBITOR_STATE = "e2e/storage/exhibitor_admin.json";
const ORGANIZER_STATE = "e2e/storage/organizer_admin.json";

// This file mutates shared Supabase license/seat rows. `fullyParallel` can split
// serial describe blocks across workers, so keep the file itself ordered.
test.describe.configure({ mode: "serial" });

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
const TEST_PASSWORD = "E2E_TestPass_2026!Secure";

function projectEmailSlug(projectName: string) {
  return projectName.replace(/[^a-z0-9_-]/gi, "-").slice(0, 32) || "project";
}

/** Unique per Playwright project + suffix so parallel browser projects never fight over the same auth/users rows. */
function testEmail(projectName: string, suffix: string) {
  return `e2e-lic-${projectEmailSlug(projectName)}-${suffix}@test-e2e.example.com`;
}

function generateE2ELicenseKey(): string {
  return "LIC-" + randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

type LicenseSnapshot = { status: string; seats_total: number };
type CompanyScopedLicenseSnapshot = {
  id: string;
  status: string;
  seats_total: number;
  expires_at: string;
  starts_at: string | null;
};
type CompanyScopedLicenseLease = {
  snap: CompanyScopedLicenseSnapshot | null;
  insertedId: string | null;
};
type UserAccessModeSnapshot = {
  id: string;
  event_access_mode: string | null;
};

async function fetchLicenseSnapshot(
  licenseId: string
): Promise<LicenseSnapshot | null> {
  const rows = await supabaseGet<LicenseSnapshot>(
    "licenses",
    `id=eq.${licenseId}&select=status,seats_total`
  );
  return rows[0] ?? null;
}

async function restoreLicenseSnapshot(
  licenseId: string,
  snap: LicenseSnapshot
): Promise<void> {
  await supabasePatch("licenses", `id=eq.${licenseId}`, {
    status: snap.status,
    seats_total: snap.seats_total,
  });
}

async function fetchCompanyScopedLicenseSnapshot(
  exhibitorCompanyId: string
): Promise<CompanyScopedLicenseSnapshot | null> {
  const rows = await supabaseGet<CompanyScopedLicenseSnapshot>(
    "licenses",
    `exhibitor_company_id=eq.${exhibitorCompanyId}&scope=eq.company&select=id,status,seats_total,expires_at,starts_at&order=created_at.desc&limit=1`
  );
  return rows[0] ?? null;
}

async function restoreCompanyScopedLicenseSnapshot(
  snap: CompanyScopedLicenseSnapshot
): Promise<void> {
  await supabasePatch("licenses", `id=eq.${snap.id}`, {
    status: snap.status,
    seats_total: snap.seats_total,
    expires_at: snap.expires_at,
    starts_at: snap.starts_at,
  });
}

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ensureCompanyScopedLicenseForTest(
  exhibitorCompanyId: string,
  companyId: string,
  status: "active" | "expired"
): Promise<CompanyScopedLicenseLease> {
  const existing = await fetchCompanyScopedLicenseSnapshot(exhibitorCompanyId);
  const expiresAt = status === "active" ? futureDate(365) : "2000-01-01";
  if (existing) {
    await supabasePatch("licenses", `id=eq.${existing.id}`, {
      status,
      expires_at: expiresAt,
      starts_at: null,
      seats_total: Math.max(10, Number(existing.seats_total ?? 0)),
    });
    return { snap: existing, insertedId: null };
  }

  const inserted = await supabaseInsert<{ id: string }>("licenses", {
    company_id: companyId,
    exhibitor_company_id: exhibitorCompanyId,
    event_id: null,
    license_key: generateE2ELicenseKey(),
    seats_total: 10,
    seats_used: 0,
    status,
    expires_at: expiresAt,
    scope: "company",
    term_months: 12,
    price_cents: 0,
    currency: "USD",
  });
  return { snap: null, insertedId: inserted.id };
}

async function restoreCompanyScopedLicenseLease(
  lease: CompanyScopedLicenseLease | null
): Promise<void> {
  if (!lease) return;
  if (lease.insertedId) {
    await supabaseDelete("licenses", `id=eq.${lease.insertedId}`);
    return;
  }
  if (lease.snap) {
    await restoreCompanyScopedLicenseSnapshot(lease.snap);
  }
}

async function fetchUserAccessModeSnapshot(userId: string): Promise<UserAccessModeSnapshot | null> {
  const rows = await supabaseGet<UserAccessModeSnapshot>(
    "users",
    `id=eq.${userId}&select=id,event_access_mode`
  );
  return rows[0] ?? null;
}

async function restoreUserAccessModeSnapshot(snap: UserAccessModeSnapshot | null): Promise<void> {
  if (!snap) return;
  await supabasePatch("users", `id=eq.${snap.id}`, {
    event_access_mode: snap.event_access_mode,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Admin license management (UI)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("admin license management", () => {
  test.use({ storageState: ADMIN_STATE });

  test("licenses page loads with table and create button", async ({ page }) => {
    await page.goto(`${BASE}/admin/licenses`);
    await expect(page).toHaveURL(/licenses/);
    await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /create license/i })
    ).toBeVisible();
  });

  test("license rows have all action buttons", async ({ page }) => {
    await page.goto(`${BASE}/admin/licenses`);
    const row = page.locator("tbody tr").first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await expect(row.getByLabel("Add seats")).toBeVisible();
    await expect(row.getByLabel("Edit license")).toBeVisible();
    await expect(row.getByLabel("Deactivate license")).toBeVisible();
    await expect(row.getByLabel("Delete license")).toBeVisible();
  });

  test("clicking delete opens confirmation modal", async ({ page }) => {
    await page.goto(`${BASE}/admin/licenses`);
    const row = page.locator("tbody tr").first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByLabel("Delete license").click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/permanently delete/i)).toBeVisible();
    await expect(
      modal.getByRole("button", { name: /delete license/i })
    ).toBeVisible();
    await expect(
      modal.getByRole("button", { name: /cancel/i })
    ).toBeVisible();

    // Dismiss without deleting
    await modal.getByRole("button", { name: /cancel/i }).click();
    await expect(modal).not.toBeVisible();
  });
});

test.describe("platform admin company-scoped user management", () => {
  test.use({ storageState: ADMIN_STATE });

  test("active company-scoped user row exposes manage actions without resend", async ({ page }) => {
    await page.goto(`${BASE}/admin/company-licenses/users`);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({ timeout: 20_000 });

    const row = page.locator("tbody tr").filter({ hasText: /active/i }).first();
    if ((await row.count()) === 0) {
      test.skip(true, "No active company-scoped user rows available in this database.");
    }
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(/active/i);

    const manage = row.getByRole("button", { name: /manage/i });
    await expect(manage).toBeEnabled();
    await manage.click();

    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^remove$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /resend invite/i })).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Exhibitor seat visibility (UI)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("exhibitor seat visibility", () => {
  test.use({ storageState: EXHIBITOR_STATE });

  test("exhibitor users page loads with invite button", async ({ page }) => {
    await page.goto(`${BASE}/exhibitor/users`);
    await expect(page).toHaveURL(/users/);
    await expect(
      page.getByRole("button", { name: /invite user/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("seat availability context is visible", async ({ page }) => {
    await page.goto(`${BASE}/exhibitor/users`);
    await page.waitForLoadState("networkidle");

    // Either shows "No assignable seats" warning OR a users table
    const noSeats = page.getByText(/no assignable seats are available/i);
    const table = page.locator("table");
    const noUsersMsg = page.getByText(/no users found/i);

    const visible = await Promise.all([
      noSeats.isVisible().catch(() => false),
      table.isVisible().catch(() => false),
      noUsersMsg.isVisible().catch(() => false),
    ]);
    expect(visible.some(Boolean)).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Seat enforcement (API)
// ═══════════════════════════════════════════════════════════════════════════

// Same license row is mutated; serial mode avoids concurrent PATCH races within one worker.
// Cross-browser projects still share one DB license + seat pool; license-seat-lock serializes mutating tests globally.
// Each test snapshots DB state at entry and restores in finally (no shared beforeAll snapshot).
test.describe.serial("seat enforcement", () => {
  let ctx: TestExhibitorContext;
  let pwProject: string;

  test.beforeAll(async ({}, testInfo) => {
    pwProject = testInfo.project.name;
    ctx = await resolveTestExhibitorContext();
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Shared Supabase license-seat mutation audit runs on Chromium only."
    );
    await acquireLicenseSeatLock();
  });

  test.afterEach(() => {
    releaseLicenseSeatLock();
  });

  // ── 3a. Stale company-scoped license fields do not shadow valid event entitlement ──

  test("exhibitor invite succeeds when stale company-scoped license fields fall back to valid event license", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");
    const licenseId = ctx.licenseId as string;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;
    const companySnap = await fetchCompanyScopedLicenseSnapshot(ctx.exhibitorCompanyId);
    if (!companySnap) test.skip(true, "No company-scoped license row to mark stale for fallback coverage");
    const staleCompanySnap = companySnap as CompanyScopedLicenseSnapshot;

    const inviteEmail = testEmail(pwProject, "company-stale-fallback");
    await cleanupTestUser(inviteEmail);
    let api: Awaited<ReturnType<typeof playwrightRequest.newContext>> | null = null;

    try {
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
        seats_total: Math.max(1, snap.seats_total),
      });
      await supabasePatch("licenses", `id=eq.${staleCompanySnap.id}`, {
        status: "expired",
        seats_total: 1,
        expires_at: "2000-01-01",
      });
      const staleVerify = await fetchCompanyScopedLicenseSnapshot(ctx.exhibitorCompanyId);
      expect(staleVerify?.status?.toLowerCase()).toBe("expired");

      api = await playwrightRequest.newContext({
        storageState: EXHIBITOR_STATE,
      });
      const res = await api.post(`${BASE}/api/exhibitor/invite`, {
        data: {
          email: inviteEmail,
          fullName: "E2E Company Stale Fallback",
          role: "exhibitor_admin",
          accessType: "app",
          eventId: ctx.eventId,
        },
      });

      expect(res.status()).toBe(201);
      const body = (await res.json()) as { ok?: boolean; userId?: string; status?: string };
      expect(body.ok).toBe(true);
      expect(body.status).toBe("invited");
      expect(body.userId).toBeTruthy();

      const publicUsers = await supabaseGet<{
        id: string;
        email: string;
        role: string;
        company_id: string | null;
      }>("users", `email=eq.${inviteEmail}&select=id,email,role,company_id`);
      expect(publicUsers).toHaveLength(1);
      expect(publicUsers[0].id).toBe(body.userId);
      expect(publicUsers[0].company_id).toBe(ctx.exhibitorCompanyId);
      expect(publicUsers[0].role).toBe("exhibitor_admin");

      const memberships = await supabaseGet<{
        event_id: string;
        exhibitor_company_id: string | null;
        status: string;
        permissions: { admin?: boolean; app?: boolean };
      }>(
        "event_users",
        `user_id=eq.${body.userId}&event_id=eq.${ctx.eventId}&select=event_id,exhibitor_company_id,status,permissions`
      );
      expect(memberships).toHaveLength(1);
      expect(memberships[0].exhibitor_company_id).toBe(ctx.exhibitorCompanyId);
      expect(memberships[0].status).toBe("invited");
      expect(memberships[0].permissions).toMatchObject({ admin: true, app: true });
    } finally {
      await api?.dispose().catch(() => {});
      await cleanupTestUser(inviteEmail).catch(() => {});
      await restoreCompanyScopedLicenseSnapshot(staleCompanySnap).catch(() => {});
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });

  // ── 3b. All seats consumed → blocked ────────────────────────────────

  test("invite blocked when all seats consumed", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");
    const licenseId = ctx.licenseId as string;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;

    // Deterministic: always add exactly one dedicated temp app-seat consumer for this test,
    // then set seats_total to the live count so the pool is full. Does not depend on prior tests' counts.
    const fillEmail = testEmail(pwProject, "full-seats-consumer");
    await cleanupTestUser(fillEmail);
    let tempUserId: string | null = null;

    try {
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
      });

      tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
      await supabaseInsert("users", {
        id: tempUserId,
        email: fillEmail,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: tempUserId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const used = await countActiveAppUsers(
        ctx.eventId,
        ctx.exhibitorCompanyId
      );
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        seats_total: used,
      });

      const api = await playwrightRequest.newContext({
        storageState: EXHIBITOR_STATE,
      });
      const res = await api.post(`${BASE}/api/exhibitor/invite`, {
        data: {
          email: testEmail(pwProject, "full-seats"),
          fullName: "E2E Full Seats",
          role: "exhibitor_admin",
          accessType: "app",
        },
      });

      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/no available seats/i);
      await api.dispose();
    } finally {
      // Remove temp consumer first so live count does not affect restored totals.
      if (tempUserId) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${tempUserId}&event_id=eq.${ctx.eventId}`
        ).catch(() => {});
        await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
        await deleteAuthUser(tempUserId).catch(() => {});
      }
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });

  // ── 3c. Enabling app access consumes a seat ─────────────────────────

  test("enabling app access consumes a seat", async () => {
    const email = testEmail(pwProject, "consume");
    await cleanupTestUser(email);

    const before = await countActiveAppUsers(
      ctx.eventId,
      ctx.exhibitorCompanyId
    );
    const userId = await createAuthUser(email, TEST_PASSWORD);

    try {
      await supabaseInsert("users", {
        id: userId,
        email,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: userId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const after = await countActiveAppUsers(
        ctx.eventId,
        ctx.exhibitorCompanyId
      );
      expect(after).toBe(before + 1);
    } finally {
      await supabaseDelete(
        "event_users",
        `user_id=eq.${userId}&event_id=eq.${ctx.eventId}`
      ).catch(() => {});
      await supabaseDelete("users", `id=eq.${userId}`).catch(() => {});
      await deleteAuthUser(userId).catch(() => {});
    }
  });

  // ── 3d. Disabling app access releases a seat ────────────────────────

  test("disabling app access releases a seat", async () => {
    const email = testEmail(pwProject, "release");
    await cleanupTestUser(email);

    const userId = await createAuthUser(email, TEST_PASSWORD);

    try {
      await supabaseInsert("users", {
        id: userId,
        email,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: userId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const withApp = await countActiveAppUsers(
        ctx.eventId,
        ctx.exhibitorCompanyId
      );

      // Revoke app access
      await supabasePatch(
        "event_users",
        `user_id=eq.${userId}&event_id=eq.${ctx.eventId}`,
        { permissions: { admin: false, app: false } }
      );

      const withoutApp = await countActiveAppUsers(
        ctx.eventId,
        ctx.exhibitorCompanyId
      );
      expect(withoutApp).toBe(withApp - 1);
    } finally {
      await supabaseDelete(
        "event_users",
        `user_id=eq.${userId}&event_id=eq.${ctx.eventId}`
      ).catch(() => {});
      await supabaseDelete("users", `id=eq.${userId}`).catch(() => {});
      await deleteAuthUser(userId).catch(() => {});
    }
  });

  test("exhibitor invite rejects forged event/company input without partial writes", async () => {
    const inviteEmail = testEmail(pwProject, "forged-event");
    await cleanupTestUser(inviteEmail);
    let api: Awaited<ReturnType<typeof playwrightRequest.newContext>> | null = null;

    try {
      api = await playwrightRequest.newContext({
        storageState: EXHIBITOR_STATE,
      });
      const res = await api.post(`${BASE}/api/exhibitor/invite`, {
        data: {
          email: inviteEmail,
          fullName: "E2E Forged Event",
          role: "exhibitor_admin",
          accessType: "app",
          eventId: randomUUID(),
          company_id: randomUUID(),
          exhibitorCompanyId: randomUUID(),
        },
      });

      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(String(body.error ?? "")).toMatch(/outside your exhibitor scope|missing exhibitor scope/i);

      const publicUsers = await supabaseGet<{ id: string }>(
        "users",
        `email=eq.${inviteEmail}&select=id`
      );
      expect(publicUsers).toHaveLength(0);
    } finally {
      await api?.dispose().catch(() => {});
      await cleanupTestUser(inviteEmail).catch(() => {});
    }
  });

  // ── 3e. Event A license cannot satisfy event B ──────────────────────

  test("license from event A cannot satisfy event B", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");

    const allEvents = await supabaseGet<{ id: string }>(
      "events",
      "select=id&limit=10"
    );
    const licensesForCompany = await supabaseGet<{ event_id: string | null; scope: string | null }>(
      "licenses",
      `exhibitor_company_id=eq.${ctx.exhibitorCompanyId}&select=event_id,scope`
    );
    const eventScopedLicensedEventIds = new Set(
      licensesForCompany
        .filter((license) => String(license.scope ?? "event").toLowerCase() === "event")
        .map((license) => license.event_id)
        .filter((eventId): eventId is string => Boolean(eventId))
    );
    const eventB = allEvents.find((e) => e.id !== ctx.eventId && !eventScopedLicensedEventIds.has(e.id));
    test.skip(!eventB, "No unlicensed second event in DB; cannot test cross-event isolation");
    const inviteEmail = testEmail(pwProject, "event-iso");
    await cleanupTestUser(inviteEmail);

    const companyScopedSnap = await fetchCompanyScopedLicenseSnapshot(ctx.exhibitorCompanyId);
    // Ensure actor has an event_users entry for event B so invite resolves
    let createdTempMembership = false;
    let existingTempMembershipSnap: { id: string; created_at: string | null } | null = null;
    let api: Awaited<ReturnType<typeof playwrightRequest.newContext>> | null = null;
    const existing = await supabaseGet<{ id: string; created_at: string | null }>(
      "event_users",
      `user_id=eq.${ctx.userId}&event_id=eq.${eventB!.id}&exhibitor_company_id=eq.${ctx.exhibitorCompanyId}&select=id,created_at`
    );
    if (existing.length === 0) {
      await supabaseInsert("event_users", {
        event_id: eventB!.id,
        user_id: ctx.userId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: true, app: false },
        created_at: "2000-01-01T00:00:00.000Z",
      });
      createdTempMembership = true;
    } else {
      existingTempMembershipSnap = existing[0];
      await supabasePatch("event_users", `id=eq.${existing[0].id}`, {
        created_at: "2000-01-01T00:00:00.000Z",
      });
    }

    try {
      if (companyScopedSnap) {
        await supabasePatch("licenses", `id=eq.${companyScopedSnap.id}`, {
          status: "expired",
          expires_at: "2000-01-01",
        });
      }

      api = await playwrightRequest.newContext({
        storageState: EXHIBITOR_STATE,
      });
      const res = await api.post(`${BASE}/api/exhibitor/invite`, {
        data: {
          email: inviteEmail,
          fullName: "E2E Event Isolation",
          role: "exhibitor_admin",
          accessType: "app",
          eventId: eventB!.id,
        },
      });

      // Event B has no license → enforcement blocks
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/no active license/i);

      const publicUsers = await supabaseGet<{ id: string }>(
        "users",
        `email=eq.${inviteEmail}&select=id`
      );
      expect(publicUsers).toHaveLength(0);
    } finally {
      await api?.dispose().catch(() => {});
      await cleanupTestUser(inviteEmail).catch(() => {});
      if (companyScopedSnap) {
        await restoreCompanyScopedLicenseSnapshot(companyScopedSnap).catch(() => {});
      }
      if (createdTempMembership) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${ctx.userId}&event_id=eq.${eventB!.id}&exhibitor_company_id=eq.${ctx.exhibitorCompanyId}`
        ).catch(() => {});
      } else if (existingTempMembershipSnap) {
        await supabasePatch("event_users", `id=eq.${existingTempMembershipSnap.id}`, {
          created_at: existingTempMembershipSnap.created_at,
        }).catch(() => {});
      }
    }
  });

  // ── 3f. Platform admin company-scoped Users dashboard invite wiring ─
  // Company-scoped exhibitor roles route through createCompanyScopedInvite; legacy event-scoped
  // app-seat enforcement remains covered by exhibitor/organizer invite tests above.
  test.describe("platform admin add user (company-scoped access)", () => {
    test.use({ storageState: ADMIN_STATE });

    test("company-scoped Users Add User submits selected events when event seats are full", async ({
      page,
    }) => {
      test.skip(!ctx.licenseId, "No license for test exhibitor");
      const licenseId = ctx.licenseId as string;

      const snapRow = await fetchLicenseSnapshot(licenseId);
      test.skip(!snapRow, "Could not load license row");
      const snap = snapRow as LicenseSnapshot;

      const fillEmail = testEmail(pwProject, "pa-seat-fill");
      const inviteEmail = testEmail(pwProject, "pa-seat-app");
      await cleanupTestUser(fillEmail);
      await cleanupTestUser(inviteEmail);
      let tempUserId: string | null = null;
      let companyLicenseLease: CompanyScopedLicenseLease | null = null;

      try {
        companyLicenseLease = await ensureCompanyScopedLicenseForTest(
          ctx.exhibitorCompanyId,
          ctx.companyId,
          "expired"
        );
        await supabasePatch("licenses", `id=eq.${licenseId}`, {
          status: "active",
        });

        tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
        await supabaseInsert("users", {
          id: tempUserId,
          email: fillEmail,
          role: "exhibitor_admin",
          company_id: ctx.exhibitorCompanyId,
        });
        await supabaseInsert("event_users", {
          event_id: ctx.eventId,
          user_id: tempUserId,
          exhibitor_company_id: ctx.exhibitorCompanyId,
          status: "active",
          permissions: { admin: false, app: true },
        });

        const used = await countActiveAppUsers(
          ctx.eventId,
          ctx.exhibitorCompanyId
        );
        await supabasePatch("licenses", `id=eq.${licenseId}`, {
          seats_total: used,
        });

        await page.goto(`${BASE}/admin/company-licenses/users`);
        await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });

        await page.getByRole("button", { name: /^\+\s*add user$/i }).click();
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("heading", { name: /^add user$/i })
        ).toBeVisible();

        await dialog.getByLabel(/full name/i).fill("E2E PA Seat Block");
        await dialog.getByLabel(/^email/i).fill(inviteEmail);

        await dialog.locator('input[name="role-option"][value="exhibitor_viewer"]').check();
        await dialog.getByTestId("add-user-company-select").selectOption(ctx.exhibitorCompanyId);

        const eventsTrigger = dialog.getByTestId("add-user-events-trigger");
        await expect(eventsTrigger).toBeEnabled({ timeout: 10_000 });
        await eventsTrigger.click();
        await dialog.getByTestId(`add-user-event-option-${ctx.eventId}`).click();
        await dialog.getByRole("heading", { name: /^add user$/i }).click();

        await dialog.getByRole("button", { name: /add user & send invite/i }).click();

        await expect(dialog).not.toBeVisible({
          timeout: 15_000,
        });

        const usersWithEmail = await supabaseGet<{
          id: string;
          role: string;
          company_id: string | null;
        }>(
          "users",
          `email=eq.${inviteEmail}&select=id,role,company_id`
        );
        expect(usersWithEmail).toHaveLength(1);
        expect(usersWithEmail[0].role).toBe("exhibitor_viewer");
        expect(usersWithEmail[0].company_id).toBe(ctx.exhibitorCompanyId);

        const memberships = await supabaseGet<{
          event_id: string;
          status: string;
          permissions: { admin?: boolean; app?: boolean };
        }>(
          "event_users",
          `user_id=eq.${usersWithEmail[0].id}&event_id=eq.${ctx.eventId}&select=event_id,status,permissions`
        );
        expect(memberships).toHaveLength(1);
        expect(memberships[0].status).toBe("invited");
        expect(memberships[0].permissions).toMatchObject({ admin: false, app: true });
      } finally {
        if (tempUserId) {
          await supabaseDelete(
            "event_users",
            `user_id=eq.${tempUserId}&event_id=eq.${ctx.eventId}`
          ).catch(() => {});
          await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
          await deleteAuthUser(tempUserId).catch(() => {});
        }
        await cleanupTestUser(inviteEmail).catch(() => {});
        await restoreCompanyScopedLicenseLease(companyLicenseLease).catch(() => {});
        await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
      }
    });
  });

  test.describe("exhibitor admin company-team invite UI", () => {
    test.use({ storageState: EXHIBITOR_STATE });

    test("Specific events checkbox submits an assigned-event company-team invite", async ({ page }) => {
      const ownedEvents = await supabaseGet<{ id: string; name: string | null }>(
        "events",
        `company_id=eq.${ctx.exhibitorCompanyId}&select=id,name&order=created_at.desc&limit=1`
      );
      test.skip(
        ownedEvents.length === 0,
        "No company-owned event is available for the direct company-team settings surface."
      );
      const selectedEvent = ownedEvents[0]!;
      const inviteEmail = testEmail(pwProject, "ea-team-selected-event");
      await cleanupTestUser(inviteEmail);

      let companyLicenseLease: CompanyScopedLicenseLease | null = null;
      let userModeSnap: UserAccessModeSnapshot | null = null;

      try {
        companyLicenseLease = await ensureCompanyScopedLicenseForTest(
          ctx.exhibitorCompanyId,
          ctx.companyId,
          "active"
        );
        userModeSnap = await fetchUserAccessModeSnapshot(ctx.userId);
        await supabasePatch("users", `id=eq.${ctx.userId}`, {
          event_access_mode: "all_company_events",
        });

        await page.goto(`${BASE}/app/settings`);
        await expect(page.getByRole("heading", { level: 1, name: /^Account$/ })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole("heading", { name: /invite a teammate/i })).toBeVisible({
          timeout: 20_000,
        });

        await page.locator("#invite-email").fill(inviteEmail);
        await page.locator("#invite-name").fill("E2E Team Selected Event");
        await page.getByRole("radio", { name: /specific events/i }).check();
        await page.locator("#invite-eventSearch").fill(selectedEvent.id);
        await page.getByRole("checkbox", { name: selectedEvent.name ?? /Event/i }).check();
        await page.getByRole("button", { name: /^send invite$/i }).click();

        await expect(page.getByRole("status")).toContainText(/invite sent/i, {
          timeout: 20_000,
        });

        const usersWithEmail = await supabaseGet<{
          id: string;
          role: string;
          company_id: string | null;
          event_access_mode: string | null;
        }>(
          "users",
          `email=eq.${inviteEmail}&select=id,role,company_id,event_access_mode`
        );
        expect(usersWithEmail).toHaveLength(1);
        expect(usersWithEmail[0].role).toBe("exhibitor_admin");
        expect(usersWithEmail[0].company_id).toBe(ctx.exhibitorCompanyId);
        expect(usersWithEmail[0].event_access_mode).toBe("assigned_events_only");

        const memberships = await supabaseGet<{
          event_id: string;
          status: string;
          exhibitor_company_id: string | null;
        }>(
          "event_users",
          `user_id=eq.${usersWithEmail[0].id}&exhibitor_company_id=eq.${ctx.exhibitorCompanyId}&select=event_id,status,exhibitor_company_id`
        );
        expect(memberships.map((row) => row.event_id).sort()).toEqual([selectedEvent.id]);
        expect(memberships[0].status).toBe("invited");
      } finally {
        await cleanupTestUser(inviteEmail).catch(() => {});
        await restoreUserAccessModeSnapshot(userModeSnap).catch(() => {});
        await restoreCompanyScopedLicenseLease(companyLicenseLease).catch(() => {});
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3b. Invite path audit (organizer invite + claim/redeem)
// createInviteCode.ts uses the same evaluateAppAccessGrant path as these routes but
// imports server-only and cannot be loaded from this Node test process; behavior
// is covered by organizer invite (pre-insert) + claim/redeem (activation).
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial("invite path seat enforcement (audit)", () => {
  let ctx: TestExhibitorContext;
  let orgCtx: OrganizerInviteTestContext;
  let pwProject: string;

  test.beforeAll(async ({}, testInfo) => {
    pwProject = testInfo.project.name;
    if (testInfo.project.name !== "chromium") return;
    await acquireLicenseSeatLock();
    try {
      ctx = await resolveTestExhibitorContext();
      orgCtx = await ensureOrganizerInviteTestFixture(ctx);
    } finally {
      releaseLicenseSeatLock();
    }
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Shared Supabase invite-seat mutation audit runs on Chromium only."
    );
    await acquireLicenseSeatLock();
  });

  test.afterEach(() => {
    releaseLicenseSeatLock();
  });

  test("organizer invite rejects forged exhibitor company without partial writes", async () => {
    const inviteEmail = testEmail(pwProject, "org-forged-company");
    await cleanupTestUser(inviteEmail);
    let api: Awaited<ReturnType<typeof playwrightRequest.newContext>> | null = null;

    try {
      api = await playwrightRequest.newContext({
        storageState: ORGANIZER_STATE,
      });
      const res = await api.post(`${BASE}/api/organizer/invite`, {
        data: {
          eventId: orgCtx.eventId,
          email: inviteEmail,
          fullName: "E2E Org Forged Company",
          exhibitorCompanyId: randomUUID(),
          permissions: { admin: true, app: false },
        },
      });

      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(String(body.error ?? "")).toMatch(/exhibitor is not scoped to this event/i);

      const publicUsers = await supabaseGet<{ id: string }>(
        "users",
        `email=eq.${inviteEmail}&select=id`
      );
      expect(publicUsers).toHaveLength(0);
    } finally {
      await api?.dispose().catch(() => {});
      await cleanupTestUser(inviteEmail).catch(() => {});
    }
  });

  test("organizer invite without app access succeeds when seats are full", async () => {
    const licenseId = orgCtx.licenseId;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;

    const fillEmail = testEmail(pwProject, "org-audit-fill");
    const inviteEmail = testEmail(pwProject, "org-audit-no-app");
    await cleanupTestUser(fillEmail);
    await cleanupTestUser(inviteEmail);
    let tempUserId: string | null = null;

    try {
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
      });

      tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
      await supabaseInsert("users", {
        id: tempUserId,
        email: fillEmail,
        role: "exhibitor_admin",
        company_id: orgCtx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: orgCtx.eventId,
        user_id: tempUserId,
        exhibitor_company_id: orgCtx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const used = await countActiveAppUsers(
        orgCtx.eventId,
        orgCtx.exhibitorCompanyId
      );
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        seats_total: used,
      });

      const api = await playwrightRequest.newContext({
        storageState: ORGANIZER_STATE,
      });
      const res = await api.post(`${BASE}/api/organizer/invite`, {
        data: {
          eventId: orgCtx.eventId,
          email: inviteEmail,
          fullName: "E2E Org Audit No App",
          exhibitorCompanyId: orgCtx.exhibitorCompanyId,
          permissions: { admin: true, app: false },
        },
      });

      const body = (await res.json()) as { ok?: boolean; error?: string };
      // Seat enforcement must not block non-app invites (no 409). When Supabase cannot
      // send invite email in dev, we still get 400 after passing scope + exhibitor checks.
      if (res.status() === 201) {
        expect(body.ok).toBe(true);
      } else {
        expect(res.status()).toBe(400);
        expect(String(body.error ?? "")).not.toMatch(/no available seats/i);
        expect(String(body.error ?? "")).toMatch(
          /sending invite email|invite email|failed to send invite/i
        );
      }
      await api.dispose();
    } finally {
      await cleanupTestUser(inviteEmail).catch(() => {});
      if (tempUserId) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${tempUserId}&event_id=eq.${orgCtx.eventId}`
        ).catch(() => {});
        await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
        await deleteAuthUser(tempUserId).catch(() => {});
      }
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });

  test("organizer invite with app access is blocked when seats are full", async () => {
    const licenseId = orgCtx.licenseId;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;

    const fillEmail = testEmail(pwProject, "org-audit-fill-app");
    await cleanupTestUser(fillEmail);
    let tempUserId: string | null = null;

    try {
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
      });

      tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
      await supabaseInsert("users", {
        id: tempUserId,
        email: fillEmail,
        role: "exhibitor_admin",
        company_id: orgCtx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: orgCtx.eventId,
        user_id: tempUserId,
        exhibitor_company_id: orgCtx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const used = await countActiveAppUsers(
        orgCtx.eventId,
        orgCtx.exhibitorCompanyId
      );
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        seats_total: used,
      });

      const api = await playwrightRequest.newContext({
        storageState: ORGANIZER_STATE,
      });
      const res = await api.post(`${BASE}/api/organizer/invite`, {
        data: {
          eventId: orgCtx.eventId,
          email: testEmail(pwProject, "org-audit-app-blocked"),
          fullName: "E2E Org Audit App",
          exhibitorCompanyId: orgCtx.exhibitorCompanyId,
          permissions: { admin: true, app: true },
        },
      });

      expect(res.status()).toBe(409);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/no available seats/i);
      await api.dispose();
    } finally {
      if (tempUserId) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${tempUserId}&event_id=eq.${orgCtx.eventId}`
        ).catch(() => {});
        await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
        await deleteAuthUser(tempUserId).catch(() => {});
      }
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });

  test("invite claim with permissions.app true returns 400 when no seats remain", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");
    const licenseId = ctx.licenseId as string;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;

    const fillEmail = testEmail(pwProject, "claim-audit-fill-app");
    const claimEmail = testEmail(pwProject, "claim-audit-app");
    await cleanupTestUser(fillEmail);
    await cleanupTestUser(claimEmail);

    const code = `claim-${pwProject}-778899`;
    const codeHash = sha256Hex(code);
    let tempUserId: string | null = null;
    let inviteId: string | null = null;

    try {
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
      });

      tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
      await supabaseInsert("users", {
        id: tempUserId,
        email: fillEmail,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: tempUserId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const used = await countActiveAppUsers(ctx.eventId, ctx.exhibitorCompanyId);
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        seats_total: used,
      });

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const inserted = await supabaseInsert<{ id: string }>("invite_codes", {
        event_id: ctx.eventId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        email: claimEmail,
        permissions: { admin: true, app: true },
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      inviteId = inserted.id;

      const api = await playwrightRequest.newContext({
        extraHTTPHeaders: {
          // Middleware otherwise returns 401 for unauthenticated /api/* in dev.
          "x-dev-bypass": "true",
        },
      });
      const res = await api.post(`${BASE}/api/invites/claim`, {
        data: {
          email: claimEmail,
          code,
          password: TEST_PASSWORD,
        },
      });

      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/no available seats/i);
      await api.dispose();
    } finally {
      await cleanupTestUser(claimEmail).catch(() => {});
      if (tempUserId) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${tempUserId}&event_id=eq.${ctx.eventId}`
        ).catch(() => {});
        await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
        await deleteAuthUser(tempUserId).catch(() => {});
      }
      if (inviteId) {
        await supabaseDelete("invite_codes", `id=eq.${inviteId}`).catch(
          () => {}
        );
      }
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });

  test("invite claim with permissions.app false succeeds when seats are full", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");
    const licenseId = ctx.licenseId as string;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;

    const fillEmail = testEmail(pwProject, "claim-audit-fill-no-app");
    const claimEmail = testEmail(pwProject, "claim-audit-no-app");
    await cleanupTestUser(fillEmail);
    await cleanupTestUser(claimEmail);

    const code = `claim-${pwProject}-445566`;
    const codeHash = sha256Hex(code);
    let tempUserId: string | null = null;
    let inviteId: string | null = null;

    try {
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
      });

      tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
      await supabaseInsert("users", {
        id: tempUserId,
        email: fillEmail,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: tempUserId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const used = await countActiveAppUsers(ctx.eventId, ctx.exhibitorCompanyId);
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        seats_total: used,
      });

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const inserted = await supabaseInsert<{ id: string }>("invite_codes", {
        event_id: ctx.eventId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        email: claimEmail,
        permissions: { admin: true, app: false },
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      inviteId = inserted.id;

      const api = await playwrightRequest.newContext({
        extraHTTPHeaders: {
          "x-dev-bypass": "true",
        },
      });
      const res = await api.post(`${BASE}/api/invites/claim`, {
        data: {
          email: claimEmail,
          code,
          password: TEST_PASSWORD,
        },
      });

      expect(res.status()).toBe(200);
      const body = (await res.json()) as { ok?: boolean };
      expect(body.ok).toBe(true);

      await api.dispose();
      await cleanupTestUser(claimEmail);
    } finally {
      if (tempUserId) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${tempUserId}&event_id=eq.${ctx.eventId}`
        ).catch(() => {});
        await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
        await deleteAuthUser(tempUserId).catch(() => {});
      }
      if (inviteId) {
        await supabaseDelete("invite_codes", `id=eq.${inviteId}`).catch(
          () => {}
        );
      }
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });

  test("invite redeem with permissions.app true returns 400 when no seats remain", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");
    const licenseId = ctx.licenseId as string;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;

    const euRows = await supabaseGet<{
      id: string;
      status: string | null;
      permissions: unknown;
    }>(
      "event_users",
      `user_id=eq.${ctx.userId}&event_id=eq.${ctx.eventId}&exhibitor_company_id=eq.${ctx.exhibitorCompanyId}&select=id,status,permissions`
    );
    test.skip(!euRows.length, "No exhibitor event_users row for redeem");
    const exhibitorMembershipSnap = euRows[0]!;

    const fillEmail = testEmail(pwProject, "redeem-audit-fill-app");
    await cleanupTestUser(fillEmail);

    const code = `redeem-${pwProject}-334455`;
    const codeHash = sha256Hex(code);
    let tempUserId: string | null = null;
    let inviteId: string | null = null;

    try {
      // If membership is already active, activation short-circuits without seat enforcement.
      await supabasePatch("event_users", `id=eq.${exhibitorMembershipSnap.id}`, {
        status: "invited",
        permissions: { admin: true, app: true },
      });

      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
      });

      tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
      await supabaseInsert("users", {
        id: tempUserId,
        email: fillEmail,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: tempUserId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const used = await countActiveAppUsers(ctx.eventId, ctx.exhibitorCompanyId);
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        seats_total: used,
      });

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const inserted = await supabaseInsert<{ id: string }>("invite_codes", {
        event_id: ctx.eventId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        email: PLAYWRIGHT_EXHIBITOR_EMAIL,
        permissions: { admin: true, app: true },
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      inviteId = inserted.id;

      const api = await playwrightRequest.newContext({
        storageState: EXHIBITOR_STATE,
      });
      const res = await api.post(`${BASE}/api/invites/redeem`, {
        data: { code },
      });

      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/no available seats/i);
      await api.dispose();
    } finally {
      await supabasePatch("event_users", `id=eq.${exhibitorMembershipSnap.id}`, {
        status: exhibitorMembershipSnap.status,
        permissions: exhibitorMembershipSnap.permissions,
      }).catch(() => {});
      if (tempUserId) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${tempUserId}&event_id=eq.${ctx.eventId}`
        ).catch(() => {});
        await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
        await deleteAuthUser(tempUserId).catch(() => {});
      }
      if (inviteId) {
        await supabaseDelete("invite_codes", `id=eq.${inviteId}`).catch(
          () => {}
        );
      }
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });

  test("invite redeem with permissions.app false succeeds when seats are full", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");
    const licenseId = ctx.licenseId as string;

    const snapRow = await fetchLicenseSnapshot(licenseId);
    test.skip(!snapRow, "Could not load license row");
    const snap = snapRow as LicenseSnapshot;

    const fillEmail = testEmail(pwProject, "redeem-audit-fill-no-app");
    await cleanupTestUser(fillEmail);

    const code = `redeem-${pwProject}-112233`;
    const codeHash = sha256Hex(code);
    let tempUserId: string | null = null;
    let inviteId: string | null = null;

    try {
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        status: "active",
      });

      tempUserId = await createAuthUser(fillEmail, TEST_PASSWORD);
      await supabaseInsert("users", {
        id: tempUserId,
        email: fillEmail,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: tempUserId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const used = await countActiveAppUsers(ctx.eventId, ctx.exhibitorCompanyId);
      await supabasePatch("licenses", `id=eq.${licenseId}`, {
        seats_total: used,
      });

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const inserted = await supabaseInsert<{ id: string }>("invite_codes", {
        event_id: ctx.eventId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        email: PLAYWRIGHT_EXHIBITOR_EMAIL,
        permissions: { admin: true, app: false },
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      inviteId = inserted.id;

      const api = await playwrightRequest.newContext({
        storageState: EXHIBITOR_STATE,
      });
      const res = await api.post(`${BASE}/api/invites/redeem`, {
        data: { code },
      });

      expect(res.status()).toBe(200);
      const body = (await res.json()) as { ok?: boolean };
      expect(body.ok).toBe(true);
      await api.dispose();
    } finally {
      if (tempUserId) {
        await supabaseDelete(
          "event_users",
          `user_id=eq.${tempUserId}&event_id=eq.${ctx.eventId}`
        ).catch(() => {});
        await supabaseDelete("users", `id=eq.${tempUserId}`).catch(() => {});
        await deleteAuthUser(tempUserId).catch(() => {});
      }
      if (inviteId) {
        await supabaseDelete("invite_codes", `id=eq.${inviteId}`).catch(
          () => {}
        );
      }
      await restoreLicenseSnapshot(licenseId, snap).catch(() => {});
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. License delete flows
// ═══════════════════════════════════════════════════════════════════════════

test.describe("license delete flows", () => {
  let ctx: TestExhibitorContext;
  let pwProject: string;

  test.beforeAll(async ({}, testInfo) => {
    pwProject = testInfo.project.name;
    ctx = await resolveTestExhibitorContext();
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Shared Supabase license delete mutation audit runs on Chromium only."
    );
    await acquireLicenseSeatLock();
  });

  test.afterEach(() => {
    releaseLicenseSeatLock();
  });

  // ── 4a. Delete unused license ───────────────────────────────────────

  test("deleting an unused license removes it from DB", async () => {
    const events = await supabaseGet<{ id: string; company_id: string }>(
      "events",
      `id=eq.${ctx.eventId}&select=id,company_id`
    );
    const eventCompanyId = events[0]?.company_id;
    test.skip(!eventCompanyId, "Cannot resolve event company");

    const organizers = await supabaseGet<{ id: string }>(
      "users",
      "email=eq.playwright-pa@test.com&select=id"
    );
    test.skip(
      !organizers.length,
      "Platform admin (playwright-pa@test.com) not found — cannot create FK-safe throwaway company"
    );

    let exhibitorCompanyId: string | null = null;
    let throwawayId: string | null = null;

    const admin = await playwrightRequest.newContext({
      storageState: ADMIN_STATE,
    });

    try {
      const exhibitorCompany = await supabaseInsert<{ id: string }>(
        "companies",
        {
          name: `E2E Del License ${Date.now()}`,
          organizer_id: organizers[0].id,
        }
      );
      exhibitorCompanyId = exhibitorCompany.id;

      await supabaseInsert("exhibitors", {
        event_id: ctx.eventId,
        company_id: exhibitorCompanyId,
        status: "active",
      });

      const expires = new Date();
      expires.setUTCFullYear(expires.getUTCFullYear() + 1);

      const throwaway = await supabaseInsert<{ id: string }>("licenses", {
        event_id: ctx.eventId,
        company_id: eventCompanyId,
        exhibitor_company_id: exhibitorCompanyId,
        license_key: `E2E-DEL-${Date.now()}`,
        seats_total: 1,
        seats_used: 0,
        status: "active",
        expires_at: expires.toISOString().slice(0, 10),
        term_months: 1,
        price_cents: 0,
        currency: "USD",
      });
      throwawayId = throwaway.id;

      const res = await admin.delete(
        `${BASE}/api/admin/licenses/${throwaway.id}`
      );
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.deleted).toBe(throwaway.id);

      const remaining = await supabaseGet(
        "licenses",
        `id=eq.${throwaway.id}&select=id`
      );
      expect(remaining.length).toBe(0);
    } catch (err) {
      throw err;
    } finally {
      await admin.dispose();
      if (throwawayId) {
        await supabaseDelete("licenses", `id=eq.${throwawayId}`).catch(
          () => {}
        );
      }
      if (exhibitorCompanyId) {
        await supabaseDelete(
          "exhibitors",
          `event_id=eq.${ctx.eventId}&company_id=eq.${exhibitorCompanyId}`
        ).catch(() => {});
        await supabaseDelete("companies", `id=eq.${exhibitorCompanyId}`).catch(
          () => {}
        );
      }
    }
  });

  // ── 4b. Delete in-use license blocked ───────────────────────────────

  test("deleting in-use license is blocked with clear error", async () => {
    test.skip(!ctx.licenseId, "No license for test exhibitor");

    const email = testEmail(pwProject, "in-use-del");
    await cleanupTestUser(email);

    const userId = await createAuthUser(email, TEST_PASSWORD);

    try {
      await supabaseInsert("users", {
        id: userId,
        email,
        role: "exhibitor_admin",
        company_id: ctx.exhibitorCompanyId,
      });
      await supabaseInsert("event_users", {
        event_id: ctx.eventId,
        user_id: userId,
        exhibitor_company_id: ctx.exhibitorCompanyId,
        status: "active",
        permissions: { admin: false, app: true },
      });

      const admin = await playwrightRequest.newContext({
        storageState: ADMIN_STATE,
      });

      // Attempt delete without force
      const res = await admin.delete(
        `${BASE}/api/admin/licenses/${ctx.licenseId}`
      );
      expect(res.status()).toBe(409);

      const body = await res.json();
      expect(body.error).toMatch(/active app user/i);
      expect(body.dependentCount).toBeGreaterThan(0);

      // Verify license was NOT removed
      const stillExists = await supabaseGet(
        "licenses",
        `id=eq.${ctx.licenseId}&select=id`
      );
      expect(stillExists.length).toBe(1);

      await admin.dispose();
    } finally {
      await supabaseDelete(
        "event_users",
        `user_id=eq.${userId}&event_id=eq.${ctx.eventId}`
      ).catch(() => {});
      await supabaseDelete("users", `id=eq.${userId}`).catch(() => {});
      await deleteAuthUser(userId).catch(() => {});
    }
  });
});
