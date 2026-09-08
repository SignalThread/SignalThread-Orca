import { randomUUID } from "crypto";
import { test, expect } from "@playwright/test";
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

function assertLocalCleanupAllowed() {
  if (isE2EArtifactCleanupAllowed(BASE_URL)) return;
  throw new Error("Refusing leads E2E cleanup outside test/local environment.");
}

test.describe("exhibitor leads workflow", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test("search and filter existing lead", async ({ page }) => {
    const ctx = await resolveTestExhibitorContext();
    const testRunId = randomUUID();
    const leadName = `E2E Leads Search ${testRunId}`;
    const lead = await supabaseInsert<LeadFixture>("leads", {
      company_id: ctx.companyId,
      owner_user_id: ctx.userId,
      event_id: ctx.eventId,
      full_name: leadName,
      email: `${testRunId.slice(0, 8)}-leads-search@example.test`,
      job_title: "E2E leads workflow",
      company_text: "E2E Leads Spec",
      priority_score: 0,
      rating: 0,
      temperature: "warm",
      status: "new",
      follow_up_date: null,
    });

    try {
      const listUrl = new URL("/exhibitor/leads", BASE_URL);
      listUrl.searchParams.set("eventId", ctx.eventId);
      await page.goto(listUrl.toString());

      await expect(page.getByRole("heading", { name: /leads intelligence/i })).toBeVisible({ timeout: 15_000 });

      const cardLocator = page.getByTestId("lead-card");
      await expect(page.locator(`[data-testid="lead-card"][data-lead-id="${lead.id}"]`)).toBeVisible({
        timeout: 15_000,
      });

      const initialCount = await cardLocator.count();
      expect(initialCount).toBeGreaterThan(0);

      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible();
      await searchInput.fill(leadName);

      await page.getByRole("button", { name: /search/i }).click();

      await page.waitForURL((url) => url.searchParams.has("q"));
      const seededCard = page.locator(`[data-testid="lead-card"][data-lead-id="${lead.id}"]`);
      await expect(seededCard).toBeVisible({ timeout: 15_000 });

      const filteredCount = await cardLocator.count();
      expect(filteredCount).toBeGreaterThan(0);
      await expect(seededCard).toContainText(leadName);

      await seededCard.locator("h3").click();
      await expect(page).toHaveURL(new RegExp(`/exhibitor/leads/${lead.id}`));
      await expect(page.getByRole("textbox", { name: /full name/i })).toHaveValue(leadName);

      await page.goBack();
      await expect(page.getByRole("heading", { name: /leads intelligence/i })).toBeVisible({ timeout: 15_000 });
      await expect(searchInput).toBeVisible();
      await searchInput.fill("");
      await page.getByRole("button", { name: /search/i }).click();
      await page.waitForURL((url) => !new URL(url).searchParams.get("q")?.trim());

      await expect(seededCard).toBeVisible({ timeout: 15_000 });
      const restoredCount = await cardLocator.count();
      expect(restoredCount).toBeGreaterThan(0);
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
});
