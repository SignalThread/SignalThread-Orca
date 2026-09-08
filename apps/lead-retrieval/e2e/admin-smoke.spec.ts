import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { BASE_URL } from "./helpers/nav";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  createAuthUser,
  deleteAuthUser,
  resolveTestExhibitorContext,
  supabaseDelete,
  supabaseGet,
  supabaseInsert,
  type TestExhibitorContext,
} from "./helpers/supabase";

const E2E_PASSWORD = "PW_test_LeadIntel_2026!Secure";

type SeededLead = {
  id: string;
  fullName: string;
  email: string;
};

type SmokeArtifactRegistry = {
  batchIds: Set<string>;
  leadIds: Set<string>;
};

function today(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function shortId(): string {
  return randomUUID().slice(0, 8);
}

function licenseKey(): string {
  return `LIC-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

async function seedLead(ctx: TestExhibitorContext, label: string): Promise<SeededLead> {
  const id = randomUUID();
  const suffix = shortId();
  const fullName = `E2E ${label} ${suffix}`;
  const email = `admin-smoke-${suffix}@test-e2e.example.com`;
  const now = new Date().toISOString();

  await supabaseInsert("leads", {
    id,
    company_id: ctx.exhibitorCompanyId,
    event_id: ctx.eventId,
    full_name: fullName,
    email,
    job_title: "Smoke Test Buyer",
    company_text: "Admin Smoke Co",
    temperature: "warm",
    priority_score: 42,
    rating: 3,
    status: "new",
    created_at: now,
    updated_at: now,
  });

  return { id, fullName, email };
}

async function cleanupSmokeArtifacts(artifacts: SmokeArtifactRegistry) {
  const batchIds = [...artifacts.batchIds];
  const leadIds = [...artifacts.leadIds];

  if (leadIds.length > 0) {
    await supabaseDelete("lead_briefings", `lead_id=in.(${leadIds.join(",")})`).catch(() => {});
    await supabaseDelete("lead_enrichments", `lead_id=in.(${leadIds.join(",")})`).catch(() => {});
    await supabaseDelete("lead_conversations", `lead_id=in.(${leadIds.join(",")})`).catch(() => {});
  }

  if (batchIds.length > 0) {
    await supabaseDelete("import_batch_row_briefings", `batch_id=in.(${batchIds.join(",")})`).catch(() => {});
    await supabaseDelete("import_batch_rows", `batch_id=in.(${batchIds.join(",")})`).catch(() => {});
    await supabaseDelete("import_batch_field_mapping_state", `batch_id=in.(${batchIds.join(",")})`).catch(() => {});
    await supabaseDelete("import_batches", `id=in.(${batchIds.join(",")})`).catch(() => {});
  }

  if (leadIds.length > 0) {
    await supabaseDelete("leads", `id=in.(${leadIds.join(",")})`).catch(() => {});
  }
}

async function selectLeadFromLeadsPage(page: Page, ctx: TestExhibitorContext, lead: SeededLead) {
  await page.goto(`${BASE_URL}/exhibitor/leads?eventId=${encodeURIComponent(ctx.eventId)}&q=${encodeURIComponent(lead.fullName)}`);
  await expect(page.getByRole("heading", { name: /leads intelligence/i })).toBeVisible({ timeout: 20_000 });
  const card = page.getByTestId("lead-card").filter({ hasText: lead.fullName }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByTestId("lead-row-select").click();
}

async function clickCreateBriefAndCaptureBatch(page: Page, artifacts: SmokeArtifactRegistry): Promise<string> {
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/exhibitor/briefings/from-leads") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("bulk-create-brief").click();
  const response = await createResponse;
  expect(response.ok()).toBeTruthy();
  const json = (await response.json()) as { batchId?: string };
  expect(json.batchId).toBeTruthy();
  artifacts.batchIds.add(json.batchId!);
  return json.batchId!;
}

async function expectPrepareWorkspace(page: Page, batchId?: string) {
  await expect(page).toHaveURL(new RegExp(`/exhibitor/briefings/${batchId ?? "[^/]+"}(?:\\?.*)?$`), {
    timeout: 20_000,
  });
  await expect(page.getByTestId("briefing-workspace-tab-prep")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("readiness-continue-review")).toBeVisible({ timeout: 20_000 });
}

async function createSelectedLeadWorkspaceViaLeadsPage(
  page: Page,
  ctx: TestExhibitorContext,
  artifacts: SmokeArtifactRegistry,
  lead: SeededLead
): Promise<string> {
  await selectLeadFromLeadsPage(page, ctx, lead);
  await expect(page.getByTestId("bulk-create-brief")).toBeVisible();
  const batchId = await clickCreateBriefAndCaptureBatch(page, artifacts);
  await expectPrepareWorkspace(page, batchId);
  return batchId;
}

async function fetchPasswordBearerToken(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: E2E_PASSWORD }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; msg?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.msg ?? `Could not sign in ${email} for E2E API smoke`);
  }
  return json.access_token;
}

async function createBearerApiContext(email: string): Promise<APIRequestContext> {
  const token = await fetchPasswordBearerToken(email);
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

type DynamicAccessFixture = {
  companyId: string;
  eventIds: string[];
  licenseIds: string[];
  userIds: string[];
  emails: string[];
  leadIds: string[];
};

async function seedAccessFixture(ctx: TestExhibitorContext): Promise<DynamicAccessFixture> {
  const companyId = ctx.exhibitorCompanyId;
  const eventIds = [randomUUID(), randomUUID()];
  const licenseId = randomUUID();
  const now = new Date().toISOString();

  for (const [index, eventId] of eventIds.entries()) {
    await supabaseInsert("events", {
      id: eventId,
      name: `E2E Admin Smoke Event ${index + 1} ${shortId()}`,
      company_id: companyId,
      start_date: today(index + 1),
      end_date: today(index + 2),
      status: "ACTIVE",
      is_active: true,
      container_kind: "event",
      city: "Testville",
      state: "NY",
      location: "E2E Hall",
      created_at: now,
      updated_at: now,
    });
    await supabaseInsert("exhibitors", {
      event_id: eventId,
      company_id: companyId,
      status: "active",
      created_at: now,
      updated_at: now,
    });
  }

  await supabaseInsert("licenses", {
    id: licenseId,
    license_key: licenseKey(),
    company_id: companyId,
    exhibitor_company_id: companyId,
    event_id: null,
    scope: "company",
    seats_total: 10,
    seats_used: 0,
    status: "active",
    starts_at: today(-1),
    expires_at: today(365),
    term_months: 12,
    price_cents: 0,
    currency: "USD",
    can_create_events: true,
    max_events: 10,
  });

  const fixture: DynamicAccessFixture = {
    companyId,
    eventIds,
    licenseIds: [licenseId],
    userIds: [],
    emails: [],
    leadIds: [],
  };

  for (const eventId of eventIds) {
    const leadId = randomUUID();
    fixture.leadIds.push(leadId);
    await supabaseInsert("leads", {
      id: leadId,
      company_id: companyId,
      event_id: eventId,
      full_name: `E2E Access Lead ${shortId()}`,
      email: `access-lead-${shortId()}@test-e2e.example.com`,
      job_title: "Access Tester",
      company_text: "Access Smoke Co",
      temperature: "warm",
      priority_score: 1,
      rating: 0,
      status: "new",
      created_at: now,
      updated_at: now,
    });
  }

  return fixture;
}

async function seedDynamicUser(input: {
  fixture: DynamicAccessFixture;
  role: "exhibitor_admin" | "exhibitor_viewer";
  eventAccessMode: "all_company_events" | "assigned_events_only";
  assignedEventIds?: string[];
  permissions?: Record<string, boolean>;
}): Promise<{ userId: string; email: string }> {
  const email = `admin-smoke-${input.role}-${shortId()}@test-e2e.example.com`;
  const userId = await createAuthUser(email, E2E_PASSWORD);
  input.fixture.userIds.push(userId);
  input.fixture.emails.push(email);

  await supabaseInsert("users", {
    id: userId,
    email,
    full_name: `Admin Smoke ${input.role}`,
    role: input.role,
    company_id: input.fixture.companyId,
    event_access_mode: input.eventAccessMode,
  });

  for (const eventId of input.assignedEventIds ?? []) {
    await supabaseInsert("event_users", {
      event_id: eventId,
      user_id: userId,
      exhibitor_company_id: input.fixture.companyId,
      status: "active",
      permissions: input.permissions ?? { admin: true, app: true },
      created_at: new Date().toISOString(),
    });
  }

  return { userId, email };
}

async function cleanupAccessFixture(fixture: DynamicAccessFixture | null) {
  if (!fixture) return;
  if (fixture.leadIds.length > 0) {
    await supabaseDelete("lead_briefings", `lead_id=in.(${fixture.leadIds.join(",")})`).catch(() => {});
    await supabaseDelete("leads", `id=in.(${fixture.leadIds.join(",")})`).catch(() => {});
  }
  if (fixture.userIds.length > 0) {
    await supabaseDelete("event_users", `user_id=in.(${fixture.userIds.join(",")})`).catch(() => {});
    await supabaseDelete("users", `id=in.(${fixture.userIds.join(",")})`).catch(() => {});
  }
  for (const userId of fixture.userIds) {
    await deleteAuthUser(userId).catch(() => {});
  }
  if (fixture.licenseIds.length > 0) {
    await supabaseDelete("licenses", `id=in.(${fixture.licenseIds.join(",")})`).catch(() => {});
  }
  if (fixture.eventIds.length > 0) {
    await supabaseDelete("exhibitors", `event_id=in.(${fixture.eventIds.join(",")})`).catch(() => {});
    await supabaseDelete("events", `id=in.(${fixture.eventIds.join(",")})`).catch(() => {});
  }
}

test.describe.configure({ mode: "serial" });

test.describe("admin UI smoke - critical exhibitor workflows", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });
  test.setTimeout(120_000);

  let ctx: TestExhibitorContext;
  let artifacts: SmokeArtifactRegistry;

  test.beforeEach(async () => {
    ctx = await resolveTestExhibitorContext();
    artifacts = { batchIds: new Set(), leadIds: new Set() };
  });

  test.afterEach(async () => {
    await cleanupSmokeArtifacts(artifacts);
  });

  test("exhibitor session loads dashboard and stays authenticated", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor`);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/(app\/)?exhibitor/);
    await expect(page.getByRole("button", { name: /sign out/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("Leads selected action creates a one-lead brief and lands on Prepare", async ({ page }) => {
    const lead = await seedLead(ctx, "One Lead Brief");
    artifacts.leadIds.add(lead.id);

    await createSelectedLeadWorkspaceViaLeadsPage(page, ctx, artifacts, lead);

    await expect(page.getByTestId("selected-lead-brief-cancel-trigger")).toBeVisible();
    await expect(page.getByTestId("readiness-continue-review")).toBeVisible();
    await expect(page.getByTestId("briefing-workspace-tab-review")).not.toHaveAttribute("aria-current", "page");
  });

  test("Leads selected action creates a multi-lead brief and cancel leaves leads intact", async ({ page }) => {
    const leadA = await seedLead(ctx, "Multi Brief");
    const leadB = await seedLead(ctx, "Multi Brief");
    artifacts.leadIds.add(leadA.id);
    artifacts.leadIds.add(leadB.id);

    await page.goto(`${BASE_URL}/exhibitor/leads?eventId=${encodeURIComponent(ctx.eventId)}&q=${encodeURIComponent("E2E Multi Brief")}`);
    await expect(page.getByRole("heading", { name: /leads intelligence/i })).toBeVisible({ timeout: 20_000 });

    const cardA = page.getByTestId("lead-card").filter({ hasText: leadA.fullName }).first();
    const cardB = page.getByTestId("lead-card").filter({ hasText: leadB.fullName }).first();
    await expect(cardA).toBeVisible({ timeout: 20_000 });
    await expect(cardB).toBeVisible({ timeout: 20_000 });
    await cardA.getByTestId("lead-row-select").click();
    await cardB.getByTestId("lead-row-select").click();

    const batchId = await clickCreateBriefAndCaptureBatch(page, artifacts);
    await expectPrepareWorkspace(page, batchId);
    await expect(page.getByRole("heading", { name: "2 selected leads" })).toBeVisible();

    await page.getByTestId("selected-lead-brief-cancel-trigger").click();
    await expect(page.getByTestId("selected-lead-brief-cancel-modal")).toBeVisible();
    await page.getByTestId("selected-lead-brief-cancel-confirm").click();
    await expect(page).toHaveURL(/\/exhibitor\/briefings(?:#.*)?$/, { timeout: 20_000 });

    const remaining = await supabaseGet<{ id: string }>(
      "leads",
      `id=in.(${leadA.id},${leadB.id})&select=id`
    );
    expect(remaining.map((row) => row.id).sort()).toEqual([leadA.id, leadB.id].sort());
  });

  test("AI Briefings lead picker creates a workspace on Prepare and continues to Review", async ({ page }) => {
    const lead = await seedLead(ctx, "Picker Brief");
    artifacts.leadIds.add(lead.id);

    await page.goto(`${BASE_URL}/exhibitor/briefings`);
    await expect(page.getByTestId("briefings-create-from-leads")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("briefings-create-from-leads").click();
    await expect(page.getByTestId("briefings-lead-picker-modal")).toBeVisible();

    await page.getByTestId("briefings-lead-picker-search").fill(lead.fullName);
    const pickerRow = page.locator("li").filter({ hasText: lead.fullName }).first();
    await expect(pickerRow).toBeVisible({ timeout: 20_000 });
    await pickerRow.getByTestId("briefings-lead-picker-checkbox").click();

    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/exhibitor/briefings/from-leads") &&
        response.request().method() === "POST"
    );
    await page.getByTestId("briefings-lead-picker-create").click();
    const response = await createResponse;
    expect(response.ok()).toBeTruthy();
    const json = (await response.json()) as { batchId?: string };
    expect(json.batchId).toBeTruthy();
    artifacts.batchIds.add(json.batchId!);

    await expectPrepareWorkspace(page, json.batchId);
    await page.getByTestId("readiness-continue-review").click();
    await expect(page).toHaveURL(new RegExp(`/exhibitor/briefings/${json.batchId}/review(?:\\?.*)?$`), {
      timeout: 20_000,
    });
    await expect(page.getByTestId("briefing-workspace-tab-review")).toHaveAttribute("aria-current", "page");
  });

  test("Review lets users edit and approve a selected-lead brief", async ({ page }) => {
    const lead = await seedLead(ctx, "Review Edit");
    artifacts.leadIds.add(lead.id);
    const batchId = await createSelectedLeadWorkspaceViaLeadsPage(page, ctx, artifacts, lead);

    await page.getByTestId("readiness-continue-review").click();
    await expect(page).toHaveURL(new RegExp(`/exhibitor/briefings/${batchId}/review(?:\\?.*)?$`), {
      timeout: 20_000,
    });
    const selectorBar = page.getByTestId("review-selector-bar");
    await expect(selectorBar).toBeVisible({ timeout: 20_000 });
    await expect(selectorBar.getByText("Standard")).toHaveCount(0);
    await expect(selectorBar.getByText("Polished")).toHaveCount(0);

    await expect(page.getByTestId("brief-section-edit-identity")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("brief-section-edit-identity").click();
    const editedHeadline = `E2E edited approved headline ${shortId()}`;
    await page.getByTestId("brief-section-editor-identity").getByLabel("Headline").fill(editedHeadline);
    await page.getByTestId("brief-section-editor-identity").getByTestId("brief-section-save").click();
    await expect(page.getByText("Brief edits saved.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(editedHeadline)).toBeVisible();

    await expect(page.getByTestId("review-approve")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("review-approve").click();

    await expect
      .poll(async () => {
        const rows = await supabaseGet<{ content: unknown }>(
          "lead_briefings",
          `lead_id=eq.${lead.id}&select=content`
        ).catch(() => []);
        return rows.some((row) => JSON.stringify(row.content).includes(editedHeadline));
      }, { timeout: 20_000 })
      .toBe(true);
  });

  test("Import wizard shows one upload lead data path with spreadsheet and Google Sheets copy", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/import/wizard`);
    await expect(page.getByTestId("import-wizard-source-selection")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId("import-wizard-source-card-csv")).toContainText("Upload lead data");
    await expect(page.getByTestId("import-wizard-source-card-csv")).toContainText(
      "Upload a CSV or Excel file, or paste a Google Sheets link."
    );
    await expect(page.getByTestId("import-wizard-source-card-crm")).toBeVisible();
    await expect(page.getByTestId("import-wizard-source-card-cloud")).toBeVisible();
    await expect(page.getByTestId("import-wizard-source-card-api")).toBeVisible();
    await expect(page.getByTestId("import-wizard-source-card-google-sheets")).toHaveCount(0);

    await page.getByTestId("import-wizard-source-card-csv").click();
    await expect(page.getByTestId("import-wizard-csv-dropzone")).toContainText(
      "Supported formats: CSV, XLSX, XLS (max 50MB), and public Google Sheets links."
    );
    await expect(page.locator("input[type='file']")).toHaveAttribute("accept", /\.csv.*\.xlsx.*\.xls/);
    await expect(page.getByTestId("import-wizard-google-sheets-inline")).toContainText(
      "Use a Google Sheet that is shared with anyone who has the link."
    );
    await expect(page.getByPlaceholder("Paste a Google Sheets link")).toBeEnabled();
  });

  test("Workspace detail layout keeps header actions aligned and hides old review polish toggle", async ({ page }) => {
    const lead = await seedLead(ctx, "Layout Brief");
    artifacts.leadIds.add(lead.id);
    const batchId = await createSelectedLeadWorkspaceViaLeadsPage(page, ctx, artifacts, lead);

    await expect(page.getByTestId("briefing-batch-workspace")).toBeVisible();
    await expect(page.getByTestId("briefing-flow-shell")).toHaveCount(0);
    const actions = page.getByTestId("briefing-workspace-header-actions");
    await expect(actions.getByTestId("selected-lead-brief-cancel-trigger")).toBeVisible();
    await expect(actions.getByTestId("briefing-workspace-status-badge")).toContainText(/in progress/i);

    await page.goto(`${BASE_URL}/exhibitor/briefings/${batchId}/review`);
    await expect(page.getByTestId("review-selector-bar")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("review-selector-bar").getByText("Standard")).toHaveCount(0);
    await expect(page.getByTestId("review-selector-bar").getByText("Polished")).toHaveCount(0);
    await expect(page.getByTestId("import-brief-view-sections")).toBeVisible();
  });
});

test.describe("admin UI smoke - exhibitor access", () => {
  test.setTimeout(120_000);
  let baseCtx: TestExhibitorContext;
  let fixture: DynamicAccessFixture | null = null;

  test.beforeEach(async () => {
    baseCtx = await resolveTestExhibitorContext();
    fixture = await seedAccessFixture(baseCtx);
  });

  test.afterEach(async () => {
    await cleanupAccessFixture(fixture);
    fixture = null;
  });

  test("all-company admin sees company events while assigned-only and viewer scopes remain restricted", async () => {
    expect(fixture).not.toBeNull();
    const allAdmin = await seedDynamicUser({
      fixture: fixture!,
      role: "exhibitor_admin",
      eventAccessMode: "all_company_events",
    });
    const assignedAdmin = await seedDynamicUser({
      fixture: fixture!,
      role: "exhibitor_admin",
      eventAccessMode: "assigned_events_only",
      assignedEventIds: [fixture!.eventIds[0]],
      permissions: { admin: true, app: true },
    });
    const viewer = await seedDynamicUser({
      fixture: fixture!,
      role: "exhibitor_viewer",
      eventAccessMode: "assigned_events_only",
      assignedEventIds: [fixture!.eventIds[0]],
      permissions: { admin: false, app: true },
    });

    const allContext = await createBearerApiContext(allAdmin.email);
    try {
      const mobileEvents = await allContext.get("/api/mobile/events");
      expect(mobileEvents.ok()).toBeTruthy();
      const json = (await mobileEvents.json()) as { events?: Array<{ id: string }> };
      const ids = new Set((json.events ?? []).map((event) => event.id));
      expect(ids.has(fixture!.eventIds[0])).toBeTruthy();
      expect(ids.has(fixture!.eventIds[1])).toBeTruthy();
    } finally {
      await allContext.dispose();
    }

    const assignedContext = await createBearerApiContext(assignedAdmin.email);
    try {
      const allowed = await assignedContext.get(`/api/exhibitor/leads/list?eventId=${encodeURIComponent(fixture!.eventIds[0])}`);
      expect(allowed.ok()).toBeTruthy();
      const denied = await assignedContext.get(`/api/exhibitor/leads/list?eventId=${encodeURIComponent(fixture!.eventIds[1])}`);
      expect(denied.status()).toBe(403);
    } finally {
      await assignedContext.dispose();
    }

    const viewerContext = await createBearerApiContext(viewer.email);
    try {
      const writeAttempt = await viewerContext.post("/api/exhibitor/briefings/from-leads", {
        data: { eventId: fixture!.eventIds[0], leadIds: [fixture!.leadIds[0]] },
      });
      expect(writeAttempt.status()).toBe(403);
    } finally {
      await viewerContext.dispose();
    }
  });
});
