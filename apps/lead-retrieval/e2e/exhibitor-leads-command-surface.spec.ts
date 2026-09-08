import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupPersistentTestArtifactsForRun,
  isE2EArtifactCleanupAllowed,
  PLAYWRIGHT_EXHIBITOR_EMAIL,
  resolveTestExhibitorContext,
  supabaseGet,
  supabaseInsert,
  type TestExhibitorContext,
} from "./helpers/supabase";
import { seedCookiesViaPasswordGrant } from "./helpers/playwright-session";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  "http://localhost:3000";

type LeadFixture = {
  id: string;
  full_name: string;
  email: string | null;
  company_text: string | null;
  rating: number | null;
  temperature: "hot" | "warm" | "cold" | null;
  follow_up_date: string | null;
};

type WorkflowFixture = {
  id: string;
  name: string;
};

function postgrestValue(value: string): string {
  return encodeURIComponent(value);
}

function assertLocalCleanupAllowed() {
  if (isE2EArtifactCleanupAllowed(BASE_URL)) return;
  throw new Error("Refusing leads command-surface E2E cleanup outside test/local environment.");
}

function expectSameIds(actual: unknown, expected: readonly string[]) {
  expect(Array.isArray(actual), `expected an array of leadIds, got ${JSON.stringify(actual)}`).toBe(true);
  expect([...(actual as string[])].sort()).toEqual([...expected].sort());
}

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeUuidArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value.replace(/[{}"]/g, "").split(",").map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

async function waitForLeadsList(page: Page) {
  await expect(page.getByRole("heading", { name: /leads intelligence/i })).toBeVisible({ timeout: 15_000 });
}

function leadCard(page: Page, leadId: string): Locator {
  return page.locator(`[data-testid="lead-card"][data-lead-id="${leadId}"]`);
}

async function gotoTestLeads(page: Page, ctx: TestExhibitorContext, searchPrefix: string) {
  const url = new URL("/exhibitor/leads", BASE_URL);
  url.searchParams.set("eventId", ctx.eventId);
  url.searchParams.set("q", searchPrefix);
  await page.goto(url.toString());
  await waitForLeadsList(page);
}

async function selectLead(page: Page, lead: LeadFixture) {
  await leadCard(page, lead.id).getByTestId("lead-row-select").check();
}

async function fetchLead(id: string): Promise<LeadFixture | null> {
  const rows = await supabaseGet<LeadFixture>(
    "leads",
    `id=eq.${postgrestValue(id)}&select=id,full_name,email,company_text,rating,temperature,follow_up_date`
  );
  return rows[0] ?? null;
}

async function countWorkflowRuns(templateId: string, leadId: string): Promise<number> {
  const rows = await supabaseGet<{ id: string }>(
    "workflow_runs",
    `template_id=eq.${postgrestValue(templateId)}&lead_id=eq.${postgrestValue(leadId)}&select=id`
  );
  return rows.length;
}

async function cleanupTrackedArtifacts(input: {
  testRunId: string;
  ctx: TestExhibitorContext;
  leadIds: string[];
  campaignIds: string[];
  importBatchIds: string[];
}) {
  assertLocalCleanupAllowed();

  await cleanupPersistentTestArtifactsForRun({
    testRunId: input.testRunId,
    companyId: input.ctx.companyId,
    eventId: input.ctx.eventId,
    leadIds: input.leadIds,
    campaignIds: input.campaignIds,
    importBatchIds: input.importBatchIds,
    baseUrl: BASE_URL,
  }).catch(() => {});
}

async function withFixture<T>(
  title: string,
  body: (fixture: {
    ctx: TestExhibitorContext;
    testRunId: string;
    searchPrefix: string;
    leadIds: string[];
    campaignIds: string[];
    importBatchIds: string[];
    seedLead: (label: string, overrides?: Record<string, unknown>) => Promise<LeadFixture>;
    seedWorkflow: (label: string, triggerConditionsJsonb: Record<string, unknown> | null) => Promise<WorkflowFixture>;
  }) => Promise<T>
): Promise<T> {
  const ctx = await resolveTestExhibitorContext();
  const testRunId = randomUUID();
  const searchPrefix = `E2E PW ${testRunId}`;
  const leadIds: string[] = [];
  const campaignIds: string[] = [];
  const importBatchIds: string[] = [];

  async function seedLead(label: string, overrides: Record<string, unknown> = {}) {
    const lead = await supabaseInsert<LeadFixture>("leads", {
      company_id: ctx.companyId,
      owner_user_id: ctx.userId,
      event_id: ctx.eventId,
      full_name: `${searchPrefix} ${label}`,
      email: `${testRunId.slice(0, 8)}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.test`,
      job_title: "E2E command surface lead",
      company_text: `Command Surface ${label}`,
      priority_score: 0,
      rating: 0,
      temperature: "warm",
      status: "new",
      follow_up_date: null,
      ...overrides,
    });
    leadIds.push(lead.id);
    return lead;
  }

  async function seedWorkflow(label: string, triggerConditionsJsonb: Record<string, unknown> | null) {
    const workflow = await supabaseInsert<WorkflowFixture>("workflow_templates", {
      company_id: ctx.companyId,
      name: `${searchPrefix} ${label}`,
      description: `${title} workflow fixture`,
      trigger_event: "lead_captured",
      scope: "event",
      event_id: ctx.eventId,
      is_enabled: true,
      version: 1,
      created_by: ctx.userId,
      trigger_conditions_jsonb: triggerConditionsJsonb,
    });
    return workflow;
  }

  try {
    return await body({
      ctx,
      testRunId,
      searchPrefix,
      leadIds,
      campaignIds,
      importBatchIds,
      seedLead,
      seedWorkflow,
    });
  } finally {
    await cleanupTrackedArtifacts({ testRunId, ctx, leadIds, campaignIds, importBatchIds });
  }
}

test.describe("exhibitor leads command surface", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test.beforeEach(async ({ context }) => {
    const cookies = await seedCookiesViaPasswordGrant(
      PLAYWRIGHT_EXHIBITOR_EMAIL,
      "PW_test_LeadIntel_2026!Secure"
    );
    const extraCookies = cookies
      .map((cookie) => {
        const url = new URL(cookie.url);
        if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
        url.hostname = "0.0.0.0";
        return { ...cookie, url: url.toString() };
      })
      .filter((cookie): cookie is (typeof cookies)[number] => Boolean(cookie));

    await context.addCookies([...cookies, ...extraCookies]);
  });

  test("selecting leads, clearing selection, and exporting selected CSV use the selected leads", async ({ page }) => {
    await withFixture(test.info().title, async ({ ctx, searchPrefix, seedLead }) => {
      const first = await seedLead("Export Alpha");
      const second = await seedLead("Export Beta");
      const third = await seedLead("Export Unselected");

      await gotoTestLeads(page, ctx, searchPrefix);
      await expect(leadCard(page, first.id)).toBeVisible();
      await expect(leadCard(page, second.id)).toBeVisible();
      await expect(leadCard(page, third.id)).toBeVisible();

      await selectLead(page, first);
      await expect(page.getByTestId("leads-bulk-action-bar")).toContainText("1");
      await expect(page.getByTestId("leads-bulk-action-bar")).toContainText(/lead selected/i);

      await selectLead(page, second);
      await expect(page.getByTestId("leads-bulk-action-bar")).toContainText("2");
      await expect(page.getByTestId("bulk-export-csv")).toBeVisible();

      await page.getByTestId("leads-bulk-clear-scope").click();
      await expect(page.getByTestId("leads-bulk-action-bar")).toHaveCount(0);
      await expect(leadCard(page, first.id).getByTestId("lead-row-select")).not.toBeChecked();
      await expect(leadCard(page, second.id).getByTestId("lead-row-select")).not.toBeChecked();

      await selectLead(page, first);
      await selectLead(page, second);

      const [exportResponse, download] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes("/api/admin/leads/export") &&
          response.request().method() === "POST"
        ),
        page.waitForEvent("download"),
        page.getByTestId("bulk-export-csv").click(),
      ]);

      expect(exportResponse.ok()).toBe(true);
      expectSameIds(exportResponse.request().postDataJSON().leadIds, [first.id, second.id]);
      const csvPath = await download.path();
      expect(csvPath).toBeTruthy();
      const csv = await readFile(csvPath!, "utf8");
      expect(csv).toContain(first.full_name);
      expect(csv).toContain(second.full_name);
      expect(csv).not.toContain(third.full_name);
    });
  });

  test("selected leads create campaigns and brief workspaces with stateful navigation", async ({ page }) => {
    await withFixture(test.info().title, async ({ ctx, searchPrefix, campaignIds, importBatchIds, seedLead }) => {
      const first = await seedLead("Campaign Alpha");
      const second = await seedLead("Campaign Beta");

      await gotoTestLeads(page, ctx, searchPrefix);
      await selectLead(page, first);
      await selectLead(page, second);

      const [campaignResponse, recipientsResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().endsWith("/api/campaigns") &&
          response.request().method() === "POST"
        ),
        page.waitForResponse((response) =>
          /\/api\/campaigns\/[^/]+\/recipients$/.test(new URL(response.url()).pathname) &&
          response.request().method() === "POST"
        ),
        page.getByTestId("bulk-create-campaign").click(),
      ]);
      expect(campaignResponse.ok()).toBe(true);
      expect(recipientsResponse.ok()).toBe(true);
      expectSameIds(recipientsResponse.request().postDataJSON().leadIds, [first.id, second.id]);

      const campaignJson = (await campaignResponse.json()) as { campaignId: string };
      campaignIds.push(campaignJson.campaignId);
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignJson.campaignId}`));

      const recipientRows = await supabaseGet<{ lead_id: string }>(
        "campaign_recipients",
        `campaign_id=eq.${postgrestValue(campaignJson.campaignId)}&select=lead_id`
      );
      expect(recipientRows.map((row) => row.lead_id).sort()).toEqual([first.id, second.id].sort());

      await gotoTestLeads(page, ctx, searchPrefix);
      await selectLead(page, first);
      await selectLead(page, second);

      const [briefResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes("/api/exhibitor/briefings/from-leads") &&
          response.request().method() === "POST"
        ),
        page.getByTestId("bulk-create-brief").click(),
      ]);
      expect(briefResponse.ok()).toBe(true);
      expectSameIds(briefResponse.request().postDataJSON().leadIds, [first.id, second.id]);

      const briefJson = (await briefResponse.json()) as { batchId: string; workspaceUrl: string; leadIds: string[] };
      importBatchIds.push(briefJson.batchId);
      expectSameIds(briefJson.leadIds, [first.id, second.id]);
      await expect(page).toHaveURL(new RegExp(briefJson.batchId));

      const batchRows = await supabaseGet<{
        id: string;
        source_kind: string;
        source_selected_lead_ids: string[] | string | null;
      }>(
        "import_batches",
        `id=eq.${postgrestValue(briefJson.batchId)}&select=id,source_kind,source_selected_lead_ids`
      );
      expect(batchRows[0]?.source_kind).toBe("selected_leads");
      expect(normalizeUuidArray(batchRows[0]?.source_selected_lead_ids).sort()).toEqual([first.id, second.id].sort());
    });
  });

  test("bulk delete and row delete call delete APIs and remove leads", async ({ page }) => {
    await withFixture(test.info().title, async ({ ctx, searchPrefix, seedLead }) => {
      const bulkOne = await seedLead("Bulk Delete One");
      const bulkTwo = await seedLead("Bulk Delete Two");
      const rowDelete = await seedLead("Row Delete");
      const viewLead = await seedLead("View Detail");

      await gotoTestLeads(page, ctx, searchPrefix);
      await selectLead(page, bulkOne);
      await selectLead(page, bulkTwo);

      const [bulkDeleteResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes("/api/exhibitor/leads/bulk-delete") &&
          response.request().method() === "POST"
        ),
        (async () => {
          await page.getByTestId("bulk-delete-selected").click();
          await page.getByRole("button", { name: /delete permanently/i }).click();
        })(),
      ]);
      expect(bulkDeleteResponse.ok()).toBe(true);
      expectSameIds(bulkDeleteResponse.request().postDataJSON().leadIds, [bulkOne.id, bulkTwo.id]);
      await expect(leadCard(page, bulkOne.id)).toHaveCount(0);
      await expect(leadCard(page, bulkTwo.id)).toHaveCount(0);
      expect(await fetchLead(bulkOne.id)).toBeNull();
      expect(await fetchLead(bulkTwo.id)).toBeNull();

      const detailLink = leadCard(page, viewLead.id).getByRole("link", { name: /view detail/i });
      await expect(detailLink).toBeVisible();
      const detailHref = await detailLink.getAttribute("href");
      expect(detailHref).toContain(`/exhibitor/leads/${viewLead.id}`);
      const detailPage = await page.context().newPage();
      try {
        await detailPage.goto(new URL(detailHref ?? "", BASE_URL).toString(), { waitUntil: "domcontentloaded" });
        await expect(detailPage).toHaveURL(new RegExp(`/exhibitor/leads/${viewLead.id}`));
        await expect(detailPage.getByRole("textbox", { name: /full name/i })).toHaveValue(viewLead.full_name);
      } finally {
        await detailPage.close();
      }

      await gotoTestLeads(page, ctx, searchPrefix);
      const [rowDeleteResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().endsWith(`/api/exhibitor/leads/${rowDelete.id}`) &&
          response.request().method() === "DELETE"
        ),
        (async () => {
          await leadCard(page, rowDelete.id).getByTestId("lead-row-delete").click();
          await page.getByRole("button", { name: /delete permanently/i }).click();
        })(),
      ]);
      expect(rowDeleteResponse.ok()).toBe(true);
      await expect(leadCard(page, rowDelete.id)).toHaveCount(0);
      expect(await fetchLead(rowDelete.id)).toBeNull();
    });
  });

  test("inline rating and temperature persist and trigger workflow qualification evaluation", async ({ page }) => {
    await withFixture(test.info().title, async ({ ctx, searchPrefix, seedLead, seedWorkflow }) => {
      const lead = await seedLead("Qualified Inline", {
        rating: 0,
        temperature: "warm",
      });
      const ratingWorkflow = await seedWorkflow("Rating Five", {
        lead_captured: {
          ruleId: "e2e-rating-5",
          rating: { in: [5] },
        },
      });
      const hotWorkflow = await seedWorkflow("Hot Lead", {
        lead_captured: {
          ruleId: "e2e-hot",
          temperature: { in: ["hot"] },
        },
      });

      await gotoTestLeads(page, ctx, searchPrefix);
      const card = leadCard(page, lead.id);
      await expect(card).toBeVisible();

      const [ratingPatchRequest] = await Promise.all([
        page.waitForRequest((request) =>
          request.url().includes(`/api/exhibitor/leads/${lead.id}`) &&
          request.method() === "PATCH"
        ),
        card.getByLabel("Set rating to 5").click(),
      ]);
      expect(ratingPatchRequest.postDataJSON()).toMatchObject({ rating: 5 });
      await expect.poll(async () => (await fetchLead(lead.id))?.rating).toBe(5);
      await expect.poll(async () => countWorkflowRuns(ratingWorkflow.id, lead.id), { timeout: 10_000 }).toBe(1);
      expect(await countWorkflowRuns(hotWorkflow.id, lead.id)).toBe(0);

      const [temperaturePatchRequest] = await Promise.all([
        page.waitForRequest((request) =>
          request.url().includes(`/api/exhibitor/leads/${lead.id}`) &&
          request.method() === "PATCH"
        ),
        card.getByRole("group", { name: /lead temperature/i }).getByRole("button", { name: "Hot" }).click(),
      ]);
      expect(temperaturePatchRequest.postDataJSON()).toMatchObject({ temperature: "hot" });
      await expect.poll(async () => (await fetchLead(lead.id))?.temperature).toBe("hot");
      await expect.poll(async () => countWorkflowRuns(hotWorkflow.id, lead.id), { timeout: 10_000 }).toBe(1);
    });
  });

  test("inline follow-up edit persists without qualification workflow evaluation", async ({ page }) => {
    await withFixture(test.info().title, async ({ ctx, searchPrefix, seedLead, seedWorkflow }) => {
      const lead = await seedLead("Non Qualification Edits", {
        rating: 0,
        temperature: "warm",
      });
      const anyWorkflow = await seedWorkflow("Any Lead Qualification Guard", null);

      await gotoTestLeads(page, ctx, searchPrefix);
      const card = leadCard(page, lead.id);
      await expect(card).toBeVisible();

      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + 1, 15);
      const followUpDate = ymd(targetDate);

      const [followUpPatchRequest] = await Promise.all([
        page.waitForRequest((request) =>
          request.url().includes(`/api/exhibitor/leads/${lead.id}`) &&
          request.method() === "PATCH"
        ),
        (async () => {
          await card.getByRole("button", { name: /set date/i }).click();
          await page.getByRole("button", { name: /next month/i }).click();
          await page.getByRole("dialog", { name: /choose follow-up date/i }).getByRole("button", { name: "15" }).click();
        })(),
      ]);
      expect(followUpPatchRequest.postDataJSON()).toMatchObject({ follow_up_date: followUpDate });
      await expect.poll(async () => (await fetchLead(lead.id))?.follow_up_date).toBe(followUpDate);
      await expect.poll(async () => countWorkflowRuns(anyWorkflow.id, lead.id)).toBe(0);
    });
  });

  test("detail email-only edit persists without qualification workflow evaluation", async ({ page }) => {
    await withFixture(test.info().title, async ({ ctx, searchPrefix, seedLead, seedWorkflow }) => {
      const lead = await seedLead("Email Only Edit", {
        rating: 0,
        temperature: "warm",
      });
      const anyWorkflow = await seedWorkflow("Any Lead Email Guard", null);

      await gotoTestLeads(page, ctx, searchPrefix);
      const card = leadCard(page, lead.id);
      await card.getByRole("link", { name: /view detail/i }).click();
      await expect(page).toHaveURL(new RegExp(`/exhibitor/leads/${lead.id}`));

      const nextEmail = `${searchPrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@updated.example.test`;
      const emailInput = page.getByRole("textbox", { name: /^email$/i });
      await expect(emailInput).toBeVisible();
      const emailPatchResponse = await page.evaluate(
        async ({ leadId, email }) => {
          const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          return {
            ok: response.ok,
            status: response.status,
            body: await response.json().catch(() => null),
          };
        },
        { leadId: lead.id, email: nextEmail }
      );
      expect(emailPatchResponse.ok).toBe(true);
      expect(emailPatchResponse.status).toBe(200);
      expect(emailPatchResponse.body).toMatchObject({ lead: { email: nextEmail } });
      await expect.poll(async () => (await fetchLead(lead.id))?.email).toBe(nextEmail);
      await expect.poll(async () => countWorkflowRuns(anyWorkflow.id, lead.id)).toBe(0);
    });
  });
});
