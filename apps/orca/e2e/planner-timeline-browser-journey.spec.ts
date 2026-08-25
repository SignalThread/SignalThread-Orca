import { expect, test } from "@playwright/test";
import { TimelineStatus, UserRole } from "@prisma/client";
import { listTimelineItems } from "../src/server/services/timeline";
import {
  createPlannerTimelineBrowserFixture,
  openEventWorkspace,
  openEventsList,
  openTimeline,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test("Planner P0 Timeline journey: edit a seeded Roadmap item status and verify persistence", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerTimelineBrowserFixture();

  try {
    const dependentTitle = `Dependent task ${Date.now()}`;
    const dependent = await fixture.harness.createTimelineItem({ eventId: fixture.eventId, ownerUserId: fixture.editorUserId, title: dependentTitle, sortOrder: 2 });
    const lifecycleTitle = `Disposition lifecycle task ${Date.now()}`;
    const lifecycleItem = await fixture.harness.createTimelineItem({ eventId: fixture.eventId, ownerUserId: fixture.editorUserId, title: lifecycleTitle, sortOrder: 3 });
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openTimeline(page);

    await page.getByRole("button", { name: "Matrix" }).click();
    await expect(page.getByRole("columnheader", { name: "Item" })).toBeVisible();

    const itemRow = page.locator("tbody tr").filter({ hasText: fixture.timelineItemTitle }).first();
    await expect(itemRow).toBeVisible();
    await expect(itemRow.getByRole("button", { name: "Backlog" })).toBeVisible();

    await itemRow.getByRole("button", { name: "Backlog" }).click();
    await itemRow.getByLabel("Status", { exact: true }).selectOption(fixture.updatedStatus);
    await expect(itemRow.getByRole("button", { name: "In Progress" })).toBeVisible();

    const dependentRow = page.locator("tbody tr").filter({ hasText: dependentTitle }).first();
    const reorderResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/events/${fixture.eventId}/timeline-items/reorder`) && response.request().method() === "POST",
    );
    await dependentRow.getByRole("button", { name: `Move ${dependentTitle} up` }).click();
    expect((await reorderResponse).status()).toBe(200);
    await expect(page.locator("tbody tr").filter({ hasText: dependentTitle }).first()).toBeVisible();

    await page.getByText("Dependencies", { exact: true }).click();
    await page.getByLabel("Must finish first").selectOption({ label: fixture.timelineItemTitle });
    await page.getByLabel("Blocked item").selectOption({ label: dependentTitle });
    await page.getByRole("button", { name: "Add link" }).click();
    await expect(page.getByLabel("Roadmap dependencies")).toContainText(`${fixture.timelineItemTitle} → ${dependentTitle}`);
    await expect(page.getByLabel("Roadmap dependencies")).toContainText("Blocked");

    const refreshedDependentRow = page.locator("tbody tr").filter({ hasText: dependentTitle }).first();
    await refreshedDependentRow.getByRole("button", { name: `Mark ${dependentTitle} Not Needed` }).click();
    await page.getByLabel("Reason required").fill("Work is no longer applicable to this event.");
    await page.getByRole("button", { name: "Mark Not Needed", exact: true }).click();
    await expect(page.locator("tbody tr").filter({ hasText: dependentTitle }).first()).toContainText("Not Needed");
    await expect(page.getByTestId("timeline-disposition-dialog")).toHaveCount(0);

    const lifecycleRow = page.locator("tbody tr").filter({ hasText: lifecycleTitle }).first();
    const lifecycleAction = lifecycleRow.getByRole("button", { name: `Mark ${lifecycleTitle} Not Needed` });
    await lifecycleAction.click();
    const dispositionDialog = page.getByTestId("timeline-disposition-dialog");
    const dispositionReason = page.getByLabel("Reason required");
    await dispositionReason.fill("Cancel should clear this reason.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dispositionDialog).toHaveCount(0);
    await expect(lifecycleAction).toBeFocused();

    await lifecycleAction.click();
    await expect(dispositionReason).toHaveValue("");
    await page.getByRole("button", { name: "Close disposition dialog" }).click();
    await expect(dispositionDialog).toHaveCount(0);
    await expect(lifecycleAction).toBeFocused();

    await lifecycleAction.click();
    await dispositionReason.fill("Backdrop should clear this reason.");
    await page.getByTestId("timeline-disposition-backdrop").click({ position: { x: 4, y: 4 } });
    await expect(dispositionDialog).toHaveCount(0);
    await expect(lifecycleAction).toBeFocused();

    let failNextDispositionSave = true;
    await page.route(`**/api/events/${fixture.eventId}/timeline-items/${lifecycleItem.id}`, async (route) => {
      if (!failNextDispositionSave) return route.continue();
      failNextDispositionSave = false;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated disposition conflict. Please retry." }),
      });
    });
    await lifecycleAction.click();
    await expect(dispositionReason).toHaveValue("");
    await dispositionReason.fill("Keep this reason after a failed save.");
    await page.getByRole("button", { name: "Mark Not Needed", exact: true }).click();
    await expect(dispositionDialog.getByRole("alert")).toContainText("Simulated disposition conflict. Please retry.");
    await expect(dispositionReason).toHaveValue("Keep this reason after a failed save.");
    await expect(page.getByRole("button", { name: "Mark Not Needed", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Mark Not Needed", exact: true }).click();
    await expect(dispositionDialog).toHaveCount(0);
    await expect(lifecycleRow.getByRole("button", { name: `Restore ${lifecycleTitle}` })).toBeFocused();
    await page.unroute(`**/api/events/${fixture.eventId}/timeline-items/${lifecycleItem.id}`);

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Filter by disposition").selectOption("NOT_NEEDED");
    await expect(page.locator("tbody tr").filter({ hasText: dependentTitle }).first()).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: fixture.timelineItemTitle })).toHaveCount(0);
    await page.getByLabel("Filter by disposition").selectOption("ALL");

    await page.setViewportSize({ width: 390, height: 844 });
    const eventNavigation = page.locator('nav[aria-label="Event navigation"]');
    await expect.poll(async () => eventNavigation.evaluate((navigation) =>
      Math.round(navigation.closest("aside")?.getBoundingClientRect().width ?? 0),
    )).toBe(80);
    const mobileLayout = await page.evaluate(() => {
      const navigation = document.querySelector('nav[aria-label="Event navigation"]');
      const aside = navigation?.closest("aside");
      const workspace = aside?.parentElement?.querySelector(":scope > section");
      return {
        viewportWidth: window.innerWidth,
        narrowMediaMatches: window.matchMedia("(max-width: 720px)").matches,
        documentWidth: document.documentElement.scrollWidth,
        sidebarWidth: Math.round(aside?.getBoundingClientRect().width ?? 0),
        workspaceLeft: Math.round(workspace?.getBoundingClientRect().left ?? 0),
        workspaceWidth: Math.round(workspace?.getBoundingClientRect().width ?? 0),
      };
    });
    expect(mobileLayout).toEqual({ viewportWidth: 390, narrowMediaMatches: true, documentWidth: 390, sidebarWidth: 80, workspaceLeft: 80, workspaceWidth: 310 });
    const dependencySummary = page.locator("summary").filter({ hasText: "Dependencies" });
    await dependencySummary.focus();
    await expect(dependencySummary).toBeFocused();
    if (process.env.PW_PROMPT13_SCREENSHOTS === "1") await page.screenshot({ path: "/tmp/orca-prompt13-roadmap-mobile.png", fullPage: true });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
    await page.getByRole("button", { name: "Matrix" }).click();

    const reloadedItemRow = page.locator("tbody tr").filter({ hasText: fixture.timelineItemTitle }).first();
    await expect(reloadedItemRow).toBeVisible();
    await expect(reloadedItemRow.getByRole("button", { name: "In Progress" })).toBeVisible();

    const persistedItem = await fixture.harness.db.timelineItem.findFirst({
      where: {
        id: fixture.timelineItemId,
        eventId: fixture.eventId,
      },
      select: {
        id: true,
        eventId: true,
        title: true,
        ownerUserId: true,
        status: true,
      },
    });
    expect(persistedItem).toEqual({
      id: fixture.timelineItemId,
      eventId: fixture.eventId,
      title: fixture.timelineItemTitle,
      ownerUserId: fixture.editorUserId,
      status: TimelineStatus.IN_PROGRESS,
    });

    const serviceItems = await listTimelineItems(
      fixture.eventId,
      {
        id: fixture.editorUserId,
        orgId: fixture.orgId,
        role: UserRole.OWNER,
      },
      { orderBy: "sortOrder" },
    );
    expect(serviceItems.find((item) => item.id === fixture.timelineItemId)).toMatchObject({
      id: fixture.timelineItemId,
      eventId: fixture.eventId,
      title: fixture.timelineItemTitle,
      ownerUserId: fixture.editorUserId,
      status: TimelineStatus.IN_PROGRESS,
    });
    expect(await fixture.harness.db.timelineDependency.count({ where: { eventId: fixture.eventId, successorItemId: dependent.id } })).toBe(1);
    expect(await fixture.harness.db.timelineItem.findUnique({ where: { id: dependent.id }, select: { disposition: true, dispositionReason: true } })).toEqual({ disposition: "NOT_NEEDED", dispositionReason: "Work is no longer applicable to this event." });
    const finalOrder = await fixture.harness.db.timelineItem.findMany({ where: { id: { in: [fixture.timelineItemId, dependent.id] } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
    expect(finalOrder.map((item) => item.id)).toEqual([dependent.id, fixture.timelineItemId]);
  } finally {
    await fixture.harness.cleanup();
  }
});

test("Roadmap Matrix expands inline subtasks without navigation and preserves roadmap order", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerTimelineBrowserFixture();

  try {
    const parentOneTitle = `Inline parent one ${Date.now()}`;
    const parentTwoTitle = `Inline parent two ${Date.now()}`;
    const parentOne = await fixture.harness.createTimelineItem({
      eventId: fixture.eventId,
      ownerUserId: fixture.editorUserId,
      title: parentOneTitle,
      sortOrder: 20,
    });
    const parentTwo = await fixture.harness.createTimelineItem({
      eventId: fixture.eventId,
      ownerUserId: fixture.editorUserId,
      title: parentTwoTitle,
      sortOrder: 30,
    });
    const childTitles = await Promise.all([1, 2, 3].map(async (index) => {
      const child = await fixture.harness.createTimelineItem({
        eventId: fixture.eventId,
        ownerUserId: fixture.editorUserId,
        parentId: parentOne.id,
        title: `Inline child ${index} ${parentOneTitle}`,
        sortOrder: index,
      });
      return child.title;
    }));
    const secondChild = await fixture.harness.createTimelineItem({
      eventId: fixture.eventId,
      ownerUserId: fixture.editorUserId,
      parentId: parentTwo.id,
      title: `Inline child for ${parentTwoTitle}`,
      sortOrder: 1,
    });

    await usePlannerOrgContext(context, baseURL, fixture.orgId);
    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openTimeline(page);
    await page.getByRole("button", { name: "Matrix" }).click();

    const parentOneToggle = page.locator(`[data-timeline-subtask-toggle="${parentOne.id}"]`);
    const parentTwoToggle = page.locator(`[data-timeline-subtask-toggle="${parentTwo.id}"]`);
    const firstChildRows = page.locator('[data-timeline-subtask-row="true"]').filter({ hasText: parentOneTitle });
    const secondChildRow = page.locator('[data-timeline-subtask-row="true"]').filter({ hasText: parentTwoTitle });
    await expect(parentOneToggle).toHaveAttribute("aria-expanded", "false");
    await expect(firstChildRows).toHaveCount(0);

    const startingUrl = page.url();
    let navigationCount = 0;
    page.on("framenavigated", () => { navigationCount += 1; });
    const scrollTop = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) throw new Error("Missing application scroll container");
      main.scrollTop = 160;
      return main.scrollTop;
    });

    await parentOneToggle.click();
    await expect(parentOneToggle).toHaveAttribute("aria-expanded", "true");
    await expect(firstChildRows).toHaveCount(3);
    await expect(page.locator('[data-timeline-subtask-row="true"]').filter({ hasText: childTitles[0]! })).toHaveCount(1);
    const hierarchy = await firstChildRows.first().evaluate((row) => {
      const titleCell = row.querySelector("td:nth-child(2)");
      const parentRow = document.querySelector("[data-timeline-subtask-toggle]")?.closest("tr");
      const parentTitle = parentRow?.querySelector("td:nth-child(2) button[data-timeline-edit-cell]");
      if (!titleCell || !parentTitle) throw new Error("Missing roadmap hierarchy cells");
      return {
        childBackground: getComputedStyle(titleCell).backgroundColor,
        childTitleLeft: titleCell.querySelector("button[data-timeline-edit-cell]")?.getBoundingClientRect().left ?? 0,
        parentTitleLeft: parentTitle.getBoundingClientRect().left,
        hasSubtaskLabel: Boolean(titleCell.textContent?.includes("Subtask")),
      };
    });
    expect(hierarchy.childBackground).not.toBe("rgb(255, 255, 255)");
    expect(hierarchy.childTitleLeft - hierarchy.parentTitleLeft).toBeGreaterThanOrEqual(32);
    expect(hierarchy.hasSubtaskLabel).toBe(true);

    await parentTwoToggle.focus();
    await parentTwoToggle.press("Enter");
    await expect(parentTwoToggle).toHaveAttribute("aria-expanded", "true");
    await expect(secondChildRow).toHaveCount(1);
    await parentOneToggle.focus();
    await parentOneToggle.press("Space");
    await expect(parentOneToggle).toHaveAttribute("aria-expanded", "false");
    await expect(firstChildRows).toHaveCount(0);
    await expect(secondChildRow).toHaveCount(1);
    expect(page.url()).toBe(startingUrl);
    expect(navigationCount).toBe(0);
    expect(await page.locator("main").evaluate((main) => main.scrollTop)).toBe(scrollTop);

    const reorderResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/events/${fixture.eventId}/timeline-items/reorder`) && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: `Move ${parentTwoTitle} up` }).click();
    expect((await reorderResponse).status()).toBe(200);
    const expectedOrder = (await fixture.harness.db.timelineItem.findMany({
      where: { eventId: fixture.eventId, parentId: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    })).map((item) => item.id);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Roadmap", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Matrix" }).click();
    await expect(page.locator(`[data-timeline-subtask-toggle="${parentOne.id}"]`)).toBeVisible();
    const renderedRootOrder = await page.locator("[data-timeline-subtask-toggle]").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-timeline-subtask-toggle")).filter(Boolean),
    );
    const expectedParentOrder = expectedOrder.filter((id) => id === parentOne.id || id === parentTwo.id);
    expect(renderedRootOrder.filter((id) => id === parentOne.id || id === parentTwo.id)).toEqual(expectedParentOrder);
    await expect(page.locator(`[data-timeline-subtask-toggle="${parentOne.id}"]`)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-timeline-subtask-row="true"]').filter({ hasText: secondChild.title })).toHaveCount(0);
  } finally {
    await fixture.harness.cleanup();
  }
});
