import { test, expect } from "@playwright/test";
import { BASE_URL } from "./helpers/nav";

test.describe("Exhibitor Documents", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test("loads, omits Tags column, shows add item CTA, and table columns when data exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/documents`);
    await expect(page.getByRole("heading", { name: "Documents & Links" })).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("button", { name: "Add Document or Link" })).toBeVisible();

    await expect(page.getByRole("columnheader", { name: /^tags$/i })).toHaveCount(0);

    const empty = page.getByText(/no documents or links found/i);
    const table = page.getByRole("table");

    if (await empty.isVisible()) {
      await expect(table).toHaveCount(0);
      return;
    }

    await expect(table).toBeVisible({ timeout: 15_000 });

    for (const label of ["Item", "Type", "Added By", "Last Updated", "Actions"]) {
      await expect(page.getByRole("columnheader", { name: new RegExp(`^${label}$`, "i") })).toBeVisible();
    }

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();

    const actionGroup = firstRow.getByRole("group", { name: /actions for/i });
    await expect(actionGroup.getByRole("link", { name: "View" })).toBeVisible();
    await expect(actionGroup.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(actionGroup.getByRole("button", { name: "Send" })).toBeVisible();
    await expect(actionGroup.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  test("search filters the document list", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/documents`);
    await expect(page.getByRole("heading", { name: "Documents & Links" })).toBeVisible({ timeout: 20_000 });

    if (await page.getByText(/no documents or links found/i).isVisible()) {
      test.skip(true, "No documents or links in environment — search narrowing not applicable");
    }

    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
    const initial = await page.locator("tbody tr").count();
    expect(initial).toBeGreaterThan(0);

    const titleLine = (await page.locator("tbody tr").first().locator("td").first().locator("p").first().innerText())
      .trim();

    const search = page.getByPlaceholder(/search documents and links by name or type/i);

    await search.fill("__pw_no_match_xyz__");
    await expect(page.locator("tbody tr")).toHaveCount(0, { timeout: 8_000 });

    await search.fill("");
    await expect(page.locator("tbody tr")).toHaveCount(initial, { timeout: 8_000 });

    await search.fill(titleLine);
    await expect
      .poll(async () => page.locator("tbody tr").count(), { timeout: 8_000 })
      .toBeGreaterThan(0);
    const narrowed = await page.locator("tbody tr").count();
    expect(narrowed).toBeLessThanOrEqual(initial);

    await search.fill("");
    await expect(page.locator("tbody tr")).toHaveCount(initial, { timeout: 8_000 });
  });

  test("add modal copy supports upload file and add link modes", async ({ page }) => {
    await page.goto(`${BASE_URL}/exhibitor/documents`);
    await expect(page.getByRole("heading", { name: "Documents & Links" })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Add Document or Link" }).click();
    await expect(page.getByRole("heading", { name: "Add Document or Link" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Upload file" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("File", { exact: true })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.getByText("Document name", { exact: true })).toBeVisible();
    await expect(page.getByText("Document type", { exact: true })).toBeVisible();
    await expect(page.getByText("Allow reps to send this item", { exact: true })).toBeVisible();
    await expect(page.getByText("If disabled, this item is internal only.", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add Link" }).click();
    await expect(page.getByRole("button", { name: "Add Link" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("URL", { exact: true })).toBeVisible();
    await expect(page.locator('input[type="url"]')).toBeVisible();
    await expect(page.getByText("Link name", { exact: true })).toBeVisible();
    await expect(page.getByText("Link type", { exact: true })).toBeVisible();
    await expect(page.getByText("Document name", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Document type", { exact: true })).toHaveCount(0);
  });
});
