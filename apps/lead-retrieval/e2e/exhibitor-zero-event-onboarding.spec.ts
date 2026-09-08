import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  cleanupTestUser,
  createAuthUser,
  deleteAuthUser,
  supabaseDelete,
  supabaseGet,
  supabaseInsert
} from "./helpers/supabase";
import { seedCookiesViaPasswordGrant } from "./helpers/playwright-session";

const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

test("direct-portfolio exhibitor admin with no events completes first-event onboarding", async ({ browser }) => {
  const suffix = randomUUID().slice(0, 8);
  const password = "Password123!";
  const email = `e2e-zero-events-${suffix}@test.com`;
  const userId = await createAuthUser(email, password);
  const companyId = randomUUID();
  const licenseId = randomUUID();
  const now = new Date().toISOString();
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;

  try {
    const hostCompany = await supabaseGet<{ organizer_id: string }>(
      "companies",
      "select=organizer_id&limit=1"
    );
    const organizerId = hostCompany[0]?.organizer_id;
    if (!organizerId) throw new Error("E2E fixture requires an organizer-owned company.");

    await supabaseInsert("companies", {
      id: companyId,
      name: `E2E Zero Events Company ${suffix}`,
      organizer_id: organizerId
    });
    await supabaseInsert("users", {
      id: userId,
      email,
      full_name: `E2E Zero Events ${suffix}`,
      role: "exhibitor_admin",
      company_id: companyId,
      event_access_mode: "all_company_events"
    });
    await supabaseInsert("licenses", {
      id: licenseId,
      license_key: `E2E-ZERO-${suffix}`,
      company_id: companyId,
      exhibitor_company_id: companyId,
      event_id: null,
      scope: "company",
      status: "active",
      can_create_events: true,
      max_events: null,
      seats_total: 10,
      seats_used: 0,
      starts_at: now,
      expires_at: "2030-01-01",
      term_months: 12,
      price_cents: 0,
      currency: "USD"
    });

    context = await browser.newContext();
    await context.addCookies(await seedCookiesViaPasswordGrant(email, password));
    const page = await context.newPage();

    // This is the post-login destination for a company-scoped portfolio admin.
    await page.goto(`${BASE}/api/auth/exhibitor-web-entry`);
    await expect(page).toHaveURL(/\/app\/events$/);
    await expect(page.getByTestId("exhibitor-no-events-onboarding")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No events yet" })).toBeVisible();
    await expect(page.getByText("Create your first event to start capturing and managing leads.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create event" })).toHaveAttribute("href", "/app/events/new");

    // Refresh is server-resolved and remains in the same company-scoped zero state.
    await page.reload();
    await expect(page.getByTestId("exhibitor-no-events-onboarding")).toBeVisible();
    await page.screenshot({ path: "/private/tmp/signalthread-exhibitor-zero-state.png", fullPage: true });

    await page.getByRole("link", { name: "Create event" }).click();
    await expect(page).toHaveURL(/\/app\/events\/new$/);
    const eventAName = `E2E First Event ${suffix}`;
    const eventBName = `E2E Second Event ${suffix}`;
    await page.getByLabel("Name").fill(eventAName);
    await page.getByLabel("Location").fill("E2E Convention Center");
    await page.getByRole("button", { name: "Create event" }).click();

    await expect(page).toHaveURL(/\/exhibitor\/dashboard\?eventId=/);
    await expect(page.getByTestId("event-workspace-header")).toBeVisible();
    await expect(page.getByTestId("exhibitor-no-events-onboarding")).toHaveCount(0);

    const createdEventId = new URL(page.url()).searchParams.get("eventId");
    expect(createdEventId).toBeTruthy();
    await page.goto(`${BASE}/app/events/${encodeURIComponent(createdEventId!)}/settings`);
    const locationField = page.getByLabel("Location");
    await expect(locationField).toHaveValue("E2E Convention Center");
    await locationField.fill("E2E Updated Hall");
    await page.getByRole("button", { name: "Save event settings" }).click();
    await expect(page.getByRole("status")).toContainText(/updated/i);
    await page.reload();
    await expect(locationField).toHaveValue("E2E Updated Hall");

    // Build a second accessible event, then exercise the shared global switcher
    // from the Create Event account route in both directions.
    await page.goto(`${BASE}/app/events/new`);
    await page.getByLabel("Name").fill(eventBName);
    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page).toHaveURL(/\/exhibitor\/dashboard\?eventId=/);
    const eventBId = new URL(page.url()).searchParams.get("eventId");
    expect(eventBId).toBeTruthy();

    await page.goto(`${BASE}/app/events/new`);
    await page.getByRole("button", { name: eventBName }).click();
    await page.getByRole("option", { name: eventAName }).click();
    await expect(page).toHaveURL(new RegExp(`/exhibitor/dashboard\\?eventId=${createdEventId}`));
    await expect(page.getByTestId("event-workspace-header")).toContainText(eventAName);

    await page.goto(`${BASE}/app/events/new`);
    await page.getByRole("button", { name: eventAName }).click();
    await page.getByRole("option", { name: eventBName }).click();
    await expect(page).toHaveURL(new RegExp(`/exhibitor/dashboard\\?eventId=${eventBId}`));
    await expect(page.getByTestId("event-workspace-header")).toContainText(eventBName);

    const events = await supabaseGet<{ company_id: string; location: string | null }>(
      "events",
      `company_id=eq.${companyId}&select=company_id,location`
    );
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.company_id === companyId)).toBe(true);
    expect(events.find((event) => event.location === "E2E Updated Hall")).toBeTruthy();
  } finally {
    await context?.close();
    await supabaseDelete("event_users", `user_id=eq.${userId}`).catch(() => {});
    await supabaseDelete("events", `company_id=eq.${companyId}`).catch(() => {});
    await supabaseDelete("licenses", `id=eq.${licenseId}`).catch(() => {});
    await supabaseDelete("users", `id=eq.${userId}`).catch(() => {});
    await supabaseDelete("companies", `id=eq.${companyId}`).catch(() => {});
    await deleteAuthUser(userId).catch(() => {});
    await cleanupTestUser(email).catch(() => {});
  }
});
