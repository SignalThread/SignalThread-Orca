import { expect, test } from "@playwright/test";
import { createPlannerP0BrowserFixture, usePlannerOrgContext } from "./helpers/planner-e2e";

test("Event Command Center readiness widgets are actionable, keyboard-safe, and responsive", async ({ baseURL, context, page }) => {
  const fixture = await createPlannerP0BrowserFixture();
  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);
    await page.goto(`/events/${fixture.eventId}`);
    await expect(page.getByRole("heading", { name: fixture.eventName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Customize dashboard" }).click();
    await page.getByRole("button", { name: "Add or hide widgets" }).click();
    await page.getByRole("tab", { name: "All Widgets" }).click();
    for (const widget of ["Session Readiness", "Speaker Readiness", "Staffing Coverage", "Approval Center", "Executive Briefing"]) {
      await page.getByRole("button", { name: `Add ${widget} widget` }).click();
    }
    await page.getByRole("button", { name: "Close customization controls" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    for (const heading of ["Session Readiness", "Speaker Readiness", "Staffing Coverage", "Approval Center", "Executive Briefing"]) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByLabel("Actionable session readiness")).toBeVisible();
    await expect(page.getByLabel("Speakers needing readiness action")).toBeVisible();
    await expect(page.getByLabel("Executive briefing facts")).toBeVisible();
    await expect(page.getByLabel("Executive briefing recommendations")).toBeVisible();
    await expect(page.getByText(/Data as of .*deterministic briefing remains grounded/)).toBeVisible();
    if (process.env.PW_PROMPT11_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/orca-prompt11-command-center-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Session Readiness", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect.poll(async () => (await page.getByRole("complementary").boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(82);
    await page.getByLabel("Actionable session readiness").getByRole("link").first().focus();
    await expect(page.getByLabel("Actionable session readiness").getByRole("link").first()).toBeFocused();
    if (process.env.PW_PROMPT11_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/orca-prompt11-command-center-mobile.png", fullPage: true });

    await page.goto(`/events/${fixture.eventId}/ai-workspace`);
    await expect(page.getByRole("heading", { name: "Executive Briefing", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Facts", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommended next actions", exact: true })).toBeVisible();
    await expect(page.getByText(/AI generation is unavailable; this deterministic briefing/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("link", { name: /Session readiness|Run of Show/ }).first().focus();
    await expect(page.getByRole("link", { name: /Session readiness|Run of Show/ }).first()).toBeFocused();
    if (process.env.PW_PROMPT12_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/orca-prompt12-ai-briefing-mobile.png", fullPage: true });
  } finally {
    await fixture.harness.cleanup();
  }
});
