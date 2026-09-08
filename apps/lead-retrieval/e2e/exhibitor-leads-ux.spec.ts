import { randomUUID } from "crypto";
import { test, expect, type Page } from "@playwright/test";
import { EXHIBITOR_ZONE_RE } from "./helpers/exhibitor-navigation";
import {
  cleanupPersistentTestArtifactsForRun,
  isE2EArtifactCleanupAllowed,
  resolveTestExhibitorContext,
  supabaseInsert,
} from "./helpers/supabase";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  "http://localhost:3000";

type LeadFixture = {
  id: string;
  full_name: string;
};

async function expectLeadsListReady(page: Page) {
  await expect(page.getByRole("heading", { name: /leads intelligence/i })).toBeVisible({ timeout: 15_000 });
}

function temperatureFilter(page: Page) {
  return page.getByRole("region", { name: /lead filters/i }).getByRole("combobox", { name: "Temperature" });
}

async function selectTemperatureFilter(page: Page, value: "hot" | "warm" | "cold" | "") {
  await temperatureFilter(page).selectOption(value);
  await expect(temperatureFilter(page)).toHaveValue(value, { timeout: 15_000 });
}

function assertLocalCleanupAllowed() {
  if (isE2EArtifactCleanupAllowed(BASE_URL)) return;
  throw new Error("Refusing leads UX E2E cleanup outside test/local environment.");
}

test.describe("exhibitor leads list UX", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test("Hot temperature filter; Any temperature clears temperature filter", async ({ page }) => {
    await page.goto("http://localhost:3000/exhibitor/leads");
    await expectLeadsListReady(page);

    await selectTemperatureFilter(page, "hot");

    await selectTemperatureFilter(page, "");
  });

  test("card opens lead detail; bulk selection shows export in bar", async ({ page }) => {
    const ctx = await resolveTestExhibitorContext();
    const testRunId = randomUUID();
    const leadName = `E2E Leads UX ${testRunId}`;
    const lead = await supabaseInsert<LeadFixture>("leads", {
      company_id: ctx.companyId,
      owner_user_id: ctx.userId,
      event_id: ctx.eventId,
      full_name: leadName,
      email: `${testRunId.slice(0, 8)}-leads-ux@example.test`,
      job_title: "E2E leads UX",
      company_text: "E2E Leads UX Spec",
      priority_score: 0,
      rating: 0,
      temperature: "warm",
      status: "new",
      follow_up_date: null,
    });

    try {
      const listUrl = new URL("/exhibitor/leads", BASE_URL);
      listUrl.searchParams.set("eventId", ctx.eventId);
      listUrl.searchParams.set("q", leadName);
      await page.goto(listUrl.toString());
      await expectLeadsListReady(page);

      const seededCard = page.locator(`[data-testid="lead-card"][data-lead-id="${lead.id}"]`);
      await expect(seededCard).toBeVisible({ timeout: 15_000 });

      await seededCard.locator("h3").click();
      await expect(page).toHaveURL(new RegExp(`/exhibitor/leads/${lead.id}`));
      await expect(page).toHaveURL(EXHIBITOR_ZONE_RE);
      await expect(page.getByRole("textbox", { name: /full name/i })).toHaveValue(leadName, { timeout: 15_000 });

      await page.goBack();
      await expectLeadsListReady(page);

      await page.getByTestId("select-all-visible").click();

      await expect(page.getByTestId("bulk-export-csv")).toBeVisible();
      await expect(page.getByTestId("leads-bulk-clear-scope")).toBeVisible();
    } finally {
      assertLocalCleanupAllowed();
      await cleanupPersistentTestArtifactsForRun({
        testRunId,
        companyId: ctx.companyId,
        eventId: ctx.eventId,
        leadIds: [lead.id],
        baseUrl: BASE_URL,
      }).catch(() => {});
    }
  });

  test("temperature filter shows bulk bar with filter copy; scoped clear returns to Any", async ({ page }) => {
    await page.goto("http://localhost:3000/exhibitor/leads");
    await expectLeadsListReady(page);
    await selectTemperatureFilter(page, "hot");

    const summary = page.locator('[aria-live="polite"]').filter({ hasText: /\d+ leads?$/ });
    await expect(summary).toBeVisible();
    const summaryText = (await summary.textContent())?.trim() ?? "";
    const countMatch = summaryText.match(/^(\d+)/);
    expect(countMatch, `expected lead count in summary, got: ${summaryText}`).not.toBeNull();
    const n = Number(countMatch![1]);
    test.skip(n === 0, "no hot leads in fixture");

    const bar = page.getByTestId("leads-bulk-action-bar");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/hot/i);
    await expect(bar).toContainText(/in filter|filter/i);
    await expect(bar.getByText(String(n), { exact: true }).first()).toBeVisible();

    await page.getByTestId("leads-bulk-clear-scope").click();
    await expect(temperatureFilter(page)).toHaveValue("", { timeout: 15_000 });
    await expect(page.getByTestId("leads-bulk-action-bar")).toHaveCount(0);
  });

  test("Warm and Cold filters show bulk action bar with matching copy", async ({ page }) => {
    for (const { label, testId } of [
      { label: "Warm" as const, testId: "warm" as const },
      { label: "Cold" as const, testId: "cold" as const }
    ]) {
      await page.goto("http://localhost:3000/exhibitor/leads");
      await expectLeadsListReady(page);
      await selectTemperatureFilter(page, testId);
      const summary = page.locator('[aria-live="polite"]').filter({ hasText: /\d+ leads?$/ });
      const summaryText = (await summary.textContent())?.trim() ?? "";
      const countMatch = summaryText.match(/^(\d+)/);
      const n = countMatch ? Number(countMatch[1]) : 0;
      if (n === 0) continue;
      const bar = page.getByTestId("leads-bulk-action-bar");
      await expect(bar).toBeVisible();
      await expect(bar).toContainText(new RegExp(label, "i"));
      await expect(bar).toContainText(/in filter|filter/i);
    }
  });

  test("manual checkbox selection overrides filter scope in bulk bar copy", async ({ page }) => {
    await page.goto("http://localhost:3000/exhibitor/leads");
    await expectLeadsListReady(page);
    await selectTemperatureFilter(page, "hot");
    const cardLocator = page.getByTestId("lead-card");
    await expect(cardLocator.first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("leads-bulk-action-bar")).toContainText(/in filter|filter/i);

    await cardLocator.first().getByTestId("lead-row-select").click();
    const bar = page.getByTestId("leads-bulk-action-bar");
    await expect(bar).toContainText(/selected|select/i);
    await expect(bar).not.toContainText("in filter");
  });

  test("row checkbox selects leads; bulk bar shows selection and create campaign", async ({ page }) => {
    await page.goto("http://localhost:3000/exhibitor/leads");
    const cardLocator = page.getByTestId("lead-card");
    await expect(cardLocator.first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("bulk-export-csv")).toHaveCount(0);

    await cardLocator.nth(0).getByTestId("lead-row-select").click();
    await expect(page.getByTestId("leads-bulk-action-bar")).toContainText(/\d/);
    await expect(page.getByTestId("leads-bulk-action-bar")).toContainText(/selected|select/i);
    await expect(page.getByTestId("bulk-create-campaign")).toBeVisible();

    await cardLocator.nth(1).getByTestId("lead-row-select").click();
    await expect(page.getByTestId("leads-bulk-action-bar")).toContainText(/\d/);

    await page.getByTestId("leads-bulk-clear-scope").click();
    await expect(page.getByTestId("bulk-export-csv")).toHaveCount(0);
  });

  test("select all in view checks header; indeterminate when one row cleared", async ({ page }) => {
    await page.goto("http://localhost:3000/exhibitor/leads");
    const cardLocator = page.getByTestId("lead-card");
    await expect(cardLocator.first()).toBeVisible({ timeout: 15_000 });

    const count = await cardLocator.count();
    test.skip(count < 2, "need at least two leads in list");

    await page.getByTestId("select-all-visible").click();
    const selectAll = page.getByTestId("select-all-visible");
    await expect(selectAll).toBeChecked();

    await cardLocator.first().getByTestId("lead-row-select").click();
    await expect(selectAll).not.toBeChecked();
  });
});
