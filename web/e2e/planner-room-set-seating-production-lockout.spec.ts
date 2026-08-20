import { expect, test } from "@playwright/test";
import {
  createPlannerQuickDrawerBrowserFixture,
  openEventWorkspace,
  openEventsList,
  openRunOfShow,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test.skip(
  process.env.PW_E2E_PRODUCTION_AVAILABILITY !== "true",
  "Requires a dedicated production-availability browser run.",
);

test("Room Set and Seating stay unavailable across the rendered production Run of Show", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerQuickDrawerBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);
    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);

    const sessionCard = page.locator(`[data-matrix2-session-card-id="${fixture.sessionId}"]`);
    await expect(sessionCard).toBeVisible();
    await sessionCard.click();

    const launcher = page.getByRole("group", { name: `Quick actions for ${fixture.sessionTitle}` });
    await expect(launcher).toBeVisible();
    for (const action of ["room-set", "seating"]) {
      const comingSoonTile = launcher.locator(`[data-matrix2-coming-soon-action="${action}"]`);
      await expect(comingSoonTile).toBeVisible();
      await expect(comingSoonTile).toContainText(action === "room-set" ? "Room Set" : "Seating");
      await expect(comingSoonTile).toContainText("Coming soon");
      await expect(comingSoonTile.getByRole("button")).toHaveCount(0);
      await expect(comingSoonTile.getByRole("link")).toHaveCount(0);
      await expect(comingSoonTile).not.toHaveAttribute("tabindex");
      await expect(comingSoonTile).not.toHaveAttribute("role", "button");
      expect(await comingSoonTile.evaluate((element) => getComputedStyle(element).cursor)).not.toBe("pointer");
      await comingSoonTile.click({ force: true });
      await expect(page).toHaveURL(/\/matrix$/);
    }

    await page.goto(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}`);
    const workspaceTab = page.locator('nav[aria-label="Session modules"] [data-session-module-unavailable="room-set-seating"]');
    const unavailableModuleCard = page.locator('[data-session-module-card="room-set-seating"]');
    for (const renderer of [workspaceTab, unavailableModuleCard]) {
      await expect(renderer).toBeVisible();
      await expect(renderer).toContainText("Room Set & Seating");
      await expect(renderer).toContainText("Coming soon");
      await expect(renderer.getByRole("link")).toHaveCount(0);
      await expect(renderer.getByRole("button")).toHaveCount(0);
      await expect(renderer).not.toHaveAttribute("tabindex");
      expect(await renderer.evaluate((element) => getComputedStyle(element).cursor)).not.toBe("pointer");
      await renderer.click({ force: true });
      await expect(page).toHaveURL(new RegExp(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}$`));
    }
    await expect(unavailableModuleCard.getByRole("link")).toHaveCount(0);
    await expect(unavailableModuleCard.getByRole("button")).toHaveCount(0);
    await expect(page.getByText("Open Room Set editor")).toHaveCount(0);
    await expect(page.getByText("Open layout workspace")).toHaveCount(0);
    await expect(page.getByText("A seating plan is missing")).toHaveCount(0);
    await expect(page.getByText("Room capacity", { exact: true })).toHaveCount(0);

    const layoutResponse = await page.goto(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}/room-set?mode=layout`);
    expect(layoutResponse?.status()).toBe(404);
    const seatingResponse = await page.goto(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}/room-set?mode=seating`);
    expect(seatingResponse?.status()).toBe(404);

    const seatingApiResponse = await page.request.get(
      `/api/events/${fixture.eventId}/seating?matrixRowId=${fixture.sessionId}`,
    );
    expect(seatingApiResponse.status()).toBe(404);
    for (const apiPath of ["/api/room-set/plan-layout", "/api/room-set/interpret-intent"]) {
      const response = await page.request.post(apiPath, { data: {} });
      expect(response.status()).toBe(404);
    }
  } finally {
    await fixture.harness.cleanup();
  }
});
