import { expect, test } from "@playwright/test";

const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

test.describe("Google one-to-one communication lead surface", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test("keeps one Email lead action and exposes the meeting workflow responsively", async ({ page }) => {
    const response = await page.request.get(`${BASE}/api/exhibitor/leads/list`);
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { leads?: Array<{ id: string; email?: string | null }> };
    const lead = payload.leads?.find((candidate) => Boolean(candidate.email));
    test.skip(!lead, "No exhibitor lead with an email is available for UI inspection.");

    await page.goto(`${BASE}/exhibitor/leads/${lead!.id}`);
    await expect(page.getByRole("navigation", { name: "Back to leads list" })).toBeVisible();
    await expect(page.getByText("Email lead", { exact: true })).toHaveCount(1);
    const schedule = page.getByTestId("google-schedule-meeting");
    await expect(schedule).toBeVisible();
    await schedule.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schedule meeting" })).toBeVisible();
  });
});
