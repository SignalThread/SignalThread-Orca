import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { BASE_URL } from "./helpers/nav";
import {
  cleanupE2EWorkflowArtifactsForRun,
  e2eWorkflowArtifactNamePrefix,
  findE2EWorkflowArtifactIdsForRun,
  resolveTestExhibitorContext,
  type TestExhibitorContext
} from "./helpers/supabase";
import { acquireLicenseSeatLock, releaseLicenseSeatLock } from "./helpers/license-seat-lock";

test.describe("Exhibitor Campaign Agents", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });
  test.setTimeout(90_000);
  let ctx: TestExhibitorContext;

  test.beforeEach(async () => {
    await acquireLicenseSeatLock();
    try {
      ctx = await resolveTestExhibitorContext();
    } catch (error) {
      releaseLicenseSeatLock();
      throw error;
    }
  });

  test.afterEach(() => {
    releaseLicenseSeatLock();
  });

  test("loads successfully and list GET does not surface Forbidden", async ({ page }) => {
    const listGet = page.waitForResponse(
      (r) =>
        r.url().includes("/api/signals") &&
        !r.url().includes("/api/signals/") &&
        r.request().method() === "GET" &&
        r.status() !== 0
    );

    await page.goto(`${BASE_URL}/exhibitor/signals?eventId=${encodeURIComponent(ctx.eventId)}`);
    await expect(page.getByRole("heading", { name: "Campaign Agents" })).toBeVisible({ timeout: 20_000 });

    const response = await listGet;
    expect(response.ok()).toBeTruthy();
    const json = (await response.json()) as { error?: string; signals?: unknown[] };
    expect(json.error).toBeUndefined();
    expect(Array.isArray(json.signals)).toBeTruthy();

    await expect(page.getByText(/^Forbidden$/)).toHaveCount(0);
  });

  test("pins a built-in default Campaign Agent at the top; default row has no Delete control", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/exhibitor/signals?eventId=${encodeURIComponent(ctx.eventId)}`);
    await expect(page.getByRole("button", { name: "Table View" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Table View" }).click();

    const defaultRow = page.locator("tbody tr").first();
    await expect(defaultRow).toBeVisible({ timeout: 15_000 });
    await expect(defaultRow.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(defaultRow.getByLabel(/Built-in default Campaign Agent/i)).toBeVisible();
  });

  test("search and category filters still narrow the table", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/signals?eventId=${encodeURIComponent(ctx.eventId)}`);
    await expect(page.getByRole("button", { name: "Table View" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Table View" }).click();

    const anyRow = page.locator("tbody tr").first();
    await expect(anyRow).toBeVisible({ timeout: 15_000 });
    const initialCount = await page.locator("tbody tr").count();
    expect(initialCount).toBeGreaterThan(0);

    await page.getByPlaceholder("Search Campaign Agents...").fill("__no_match_e2e_xyz__");
    await expect(page.locator("tbody tr")).toHaveCount(0, { timeout: 5_000 });

    await page.getByPlaceholder("Search Campaign Agents...").fill("");
    await expect(page.locator("tbody tr")).toHaveCount(initialCount);

    await page.locator("select").nth(1).selectOption("Call-to-Action");
    const afterCategory = await page.locator("tbody tr").count();
    expect(afterCategory).toBeLessThanOrEqual(initialCount);

    await page.locator("select").nth(1).selectOption("all");
    await expect(page.locator("tbody tr")).toHaveCount(initialCount, { timeout: 5_000 });
  });

  test("edit navigates to the same builder UI as create (not legacy form)", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/signals?eventId=${encodeURIComponent(ctx.eventId)}`);
    await expect(page.getByRole("button", { name: "Table View" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Table View" }).click();

    const editableRow = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
    await expect(editableRow).toBeVisible({ timeout: 15_000 });
    await editableRow.getByRole("button", { name: "Edit" }).click();

    await expect(page).toHaveURL(/\/(app\/)?exhibitor\/signals\/[^/?]+\/edit(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Edit Campaign Agent" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Starter (optional)" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^agent name$/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /default prompt/i })).toBeVisible();
  });

  test("preserves eventId when navigating to create and edit", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/signals?eventId=${encodeURIComponent(ctx.eventId)}`);
    await expect(page.getByRole("heading", { name: "Campaign Agents" })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: /create campaign agent/i }).click();
    await expect(page).toHaveURL(new RegExp(`/exhibitor/signals/new\\?eventId=${ctx.eventId}`));

    await page.goto(`${BASE_URL}/exhibitor/signals?eventId=${encodeURIComponent(ctx.eventId)}`);
    await page.getByRole("button", { name: "Table View" }).click();
    const editableRow = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
    await expect(editableRow).toBeVisible({ timeout: 15_000 });
    await editableRow.getByRole("button", { name: "Edit" }).click();
    await expect(page).toHaveURL(new RegExp(`/exhibitor/signals/[^/?]+/edit\\?eventId=${ctx.eventId}`), {
      timeout: 15_000,
    });
  });
});

test.describe("Exhibitor signal create & duplicate", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });
  test.setTimeout(90_000);
  let ctx: TestExhibitorContext;

  test.beforeEach(async () => {
    await acquireLicenseSeatLock();
    try {
      ctx = await resolveTestExhibitorContext();
    } catch (error) {
      releaseLicenseSeatLock();
      throw error;
    }
  });

  test.afterEach(() => {
    releaseLicenseSeatLock();
  });

  test("create, duplicate, and remove e2e signals", async ({ page }, testInfo) => {
    const testRunId = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
    const createdBaseName = e2eWorkflowArtifactNamePrefix(testRunId);
    const createdSignalIds = new Set<string>();
    const createdWorkflowIds = new Set<string>();
    const createdCampaignIds = new Set<string>();
    const cleanupScope = {
      testRunId,
      companyId: ctx.companyId,
      eventId: ctx.eventId,
      baseUrl: BASE_URL
    };

    async function trackCreatedArtifacts() {
      const found = await findE2EWorkflowArtifactIdsForRun(cleanupScope);
      for (const id of found.signalIds) createdSignalIds.add(id);
      for (const id of found.workflowIds) createdWorkflowIds.add(id);
      for (const id of found.campaignIds) createdCampaignIds.add(id);
    }

    try {
      await page.goto(`${BASE_URL}/exhibitor/signals/new?eventId=${encodeURIComponent(ctx.eventId)}`);
      await expect(page.getByRole("heading", { name: /create campaign agent/i })).toBeVisible({ timeout: 20_000 });

      const nameInput = page.getByRole("textbox", { name: /^agent name$/i });
      await expect(nameInput).toBeEditable({ timeout: 20_000 });
      await nameInput.fill("");
      await nameInput.pressSequentially(createdBaseName);
      await expect(nameInput).toHaveValue(createdBaseName);

      const promptInput = page.getByRole("textbox", { name: /default prompt/i });
      await expect(promptInput).toBeEditable({ timeout: 20_000 });
      await promptInput.fill("");
      await promptInput.pressSequentially("Playwright deterministic default prompt.");

      await page.getByRole("button", { name: "Create Campaign Agent" }).click();
      await expect(page).toHaveURL(/\/(app\/)?exhibitor\/signals(?:\?.*)?$/);
      await trackCreatedArtifacts();

      await expect(page.locator("tbody tr").filter({ hasText: createdBaseName })).toHaveCount(1);

      await expect(page.getByText(/^Forbidden$/)).toHaveCount(0);

      const sourceRow = page.locator("tbody tr").filter({ hasText: createdBaseName }).first();
      await sourceRow.getByRole("button", { name: "Duplicate" }).click();

      const copyName = `${createdBaseName} Copy`;
      await expect(page.locator("tbody tr").filter({ hasText: copyName })).toBeVisible({ timeout: 15_000 });
      await trackCreatedArtifacts();

      await expect(page.getByText(/^Forbidden$/)).toHaveCount(0);

      await page.locator("tbody tr").filter({ hasText: copyName }).getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("tbody tr").filter({ hasText: copyName })).toHaveCount(0, { timeout: 15_000 });

      await page.locator("tbody tr").filter({ hasText: createdBaseName }).getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("tbody tr").filter({ hasText: createdBaseName })).toHaveCount(0, { timeout: 15_000 });
    } finally {
      const cleaned = await cleanupE2EWorkflowArtifactsForRun(cleanupScope);
      for (const id of cleaned.signalIds) createdSignalIds.add(id);
      for (const id of cleaned.workflowIds) createdWorkflowIds.add(id);
      for (const id of cleaned.campaignIds) createdCampaignIds.add(id);
      const remaining = await findE2EWorkflowArtifactIdsForRun(cleanupScope);
      expect(remaining.signalIds).toEqual([]);
      expect(remaining.workflowIds).toEqual([]);
      expect(remaining.campaignIds).toEqual([]);
      testInfo.annotations.push({
        type: "e2e-cleanup",
        description: `tracked signals=${createdSignalIds.size}, workflows=${createdWorkflowIds.size}, campaigns=${createdCampaignIds.size}; cleaned signals=${cleaned.signalIds.length}, workflows=${cleaned.workflowIds.length}, campaigns=${cleaned.campaignIds.length}`
      });
    }
  });
});
