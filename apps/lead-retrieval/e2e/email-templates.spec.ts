import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { BASE_URL } from "./helpers/nav";
import { resolveTestExhibitorContext, supabaseDelete, supabaseGet } from "./helpers/supabase";

test.describe("Exhibitor Email Templates", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });
  test.setTimeout(90_000);

  test("deletes a production-created template permanently through the UI and list path", async ({ page }) => {
    const context = await resolveTestExhibitorContext();
    const name = `E2E Email Template ${randomUUID()}`;
    let templateId: string | null = null;

    try {
      await page.goto(`${BASE_URL}/exhibitor/documents?tab=email-templates`);
      await expect(page.getByRole("heading", { name: "Documents & Links" })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: "New Template" })).toBeVisible({ timeout: 20_000 });

      const createResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/exhibitor/email-templates") &&
          response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "New Template" }).click();
      await page.getByLabel("Template Name").fill(name);
      await page.getByLabel("Subject").fill("Playwright deletion regression");
      await page.getByLabel("Email Body").fill("This row must be gone after deletion.");
      await page.getByRole("button", { name: "Save" }).click();

      const createPayload = (await (await createResponse).json()) as { template?: { id?: string } };
      templateId = createPayload.template?.id ?? null;
      expect(templateId).toBeTruthy();

      const row = page.locator("tbody tr").filter({ hasText: name });
      await expect(row).toHaveCount(1, { timeout: 15_000 });

      const deleteResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/exhibitor/email-templates/${encodeURIComponent(templateId!)}`) &&
          response.request().method() === "DELETE"
      );
      const refreshedList = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/exhibitor/email-templates") &&
          response.request().method() === "GET"
      );
      await row.getByRole("button", { name: "Delete" }).click();
      const deleteDialog = page.getByRole("heading", { name: "Delete Template" }).locator("..");
      await deleteDialog.getByRole("button", { name: "Delete" }).click();

      const deletePayload = (await (await deleteResponse).json()) as {
        success?: boolean;
        templates?: Array<{ id: string }>;
      };
      expect(deletePayload.success).toBe(true);
      expect(deletePayload.templates?.some((template) => template.id === templateId)).toBe(false);

      const listPayload = (await (await refreshedList).json()) as { templates?: Array<{ id: string }> };
      expect(listPayload.templates?.some((template) => template.id === templateId)).toBe(false);
      await expect(page.getByText("Template deleted.")).toBeVisible();
      await expect(row).toHaveCount(0, { timeout: 15_000 });

      await page.reload();
      await expect(page.getByRole("heading", { name: "Documents & Links" })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("tbody tr").filter({ hasText: name })).toHaveCount(0, { timeout: 15_000 });

      const persisted = await supabaseGet<{ id: string }>(
        "email_templates",
        `id=eq.${encodeURIComponent(templateId!)}&account_id=eq.${encodeURIComponent(context.companyId)}&select=id`
      );
      expect(persisted).toEqual([]);
    } finally {
      if (templateId) {
        await supabaseDelete(
          "email_templates",
          `id=eq.${encodeURIComponent(templateId)}&account_id=eq.${encodeURIComponent(context.companyId)}`
        );
      }
    }
  });
});
