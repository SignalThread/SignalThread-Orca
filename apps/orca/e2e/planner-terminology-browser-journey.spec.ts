import { expect, test } from "@playwright/test";
import { createPlannerP0BrowserFixture, usePlannerOrgContext } from "./helpers/planner-e2e";

test("event terminology updates settings, navigation, workspace, public and export display copy without changing contracts", async ({ baseURL, context, page }) => {
  const fixture = await createPlannerP0BrowserFixture();
  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);
    await page.goto(`/events/${fixture.eventId}/settings`);
    await expect(page.getByRole("heading", { name: "Event settings" })).toBeVisible();
    await page.getByRole("button", { name: /Display terminology/ }).click();
    await expect(page.getByRole("heading", { name: "Event terminology" })).toBeVisible();

    await page.getByLabel("Agenda display label").selectOption("Show Flow");
    await page.getByLabel("Run of Show display label").selectOption("Matrix");
    await page.getByLabel("Matrix display label").selectOption("Agenda");
    await page.getByLabel("Show Flow display label").selectOption("Run of Show");
    const saveResponse = page.waitForResponse((response) => response.url().endsWith(`/api/events/${fixture.eventId}/terminology`) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save labels" }).click();
    expect((await saveResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toHaveText("Event display terminology saved.");

    const eventNavigation = page.getByRole("navigation", { name: "Event navigation" });
    const renamedLink = eventNavigation.getByRole("link", { name: "Matrix room by time operations board" });
    await expect(renamedLink).toHaveAttribute("href", `/events/${fixture.eventId}/matrix`);
    await renamedLink.click();
    await expect(page).toHaveURL(new RegExp(`/events/${fixture.eventId}/matrix$`));
    await expect(page.getByRole("heading", { name: "Matrix", exact: true })).toBeVisible();

    const projections = await page.evaluate(async ({ eventId }) => {
      const [publicResponse, exportResponse] = await Promise.all([
        fetch(`/api/public/events/${eventId}/agenda`),
        fetch(`/api/events/${eventId}/exports?role=public&format=json`),
      ]);
      return {
        publicStatus: publicResponse.status,
        publicBody: await publicResponse.json(),
        exportStatus: exportResponse.status,
        exportBody: await exportResponse.json(),
      };
    }, { eventId: fixture.eventId });
    expect(projections.publicStatus).toBe(200);
    expect(projections.publicBody).toHaveProperty("agenda");
    expect(projections.publicBody.displayLabel).toBe("Show Flow");
    expect(projections.exportStatus).toBe(200);
    expect(projections.exportBody.projection.title).toBe("Public show flow handoff");
    expect(projections.exportBody.projection.rows[0]).toContain("Published show flow");

    await page.goto(`/events/${fixture.eventId}/settings`);
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }))).toEqual({ viewport: 768, document: 768 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => page.getByRole("navigation", { name: "Event navigation" }).evaluate((navigation) => Math.round(navigation.closest("aside")?.getBoundingClientRect().width ?? 0))).toBe(80);
    const geometry = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    expect(geometry).toEqual({ viewport: 390, document: 390 });
    await page.getByRole("button", { name: /Display terminology/ }).focus();
    await expect(page.getByRole("button", { name: /Display terminology/ })).toBeFocused();
    await page.getByRole("button", { name: /Display terminology/ }).click();
    await expect(page.getByRole("heading", { name: "Event terminology" })).toBeVisible();
    await expect(page.getByLabel("Run of Show display label")).toHaveValue("Matrix");

    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto("/help");
      await expect(page.getByRole("heading", { name: /Answers for planning/ })).toBeVisible();
      await expect(page.getByText("Video walkthroughs are not available yet.")).toBeVisible();
      await expect(page.getByRole("link", { name: /Open written walkthroughs/ })).toHaveAttribute("href", "/help/category/getting-started");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }

    await page.goto(`/events/${fixture.eventId}/registration/agenda`);
    await expect(page.getByRole("heading", { name: "Official agenda" })).toBeVisible();
    const registrationHelp = page.locator('a[href*="/help/article/manage-registration-agenda"]');
    await expect(registrationHelp).toHaveAttribute("href", new RegExp("/help/article/manage-registration-agenda"));
    await registrationHelp.click();
    await expect(page.getByRole("heading", { name: "Manage Registration Agenda" })).toBeVisible();
    if (process.env.PW_PROMPT14_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/orca-prompt14-terminology-mobile.png", fullPage: true });
  } finally {
    await fixture.harness.cleanup();
  }
});
