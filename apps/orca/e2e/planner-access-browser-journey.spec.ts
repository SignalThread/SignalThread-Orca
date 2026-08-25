import { expect, test } from "@playwright/test";
import {
  createPlannerP0AccessBrowserFixture,
  openEventWorkspace,
  openEventsList,
  openRunOfShow,
  overviewSessionRowById,
  switchRunOfShowToList,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test("Planner P0 browser access journey: EVENT_VIEWER can read Run of Show but cannot edit sessions", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerP0AccessBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);
    await switchRunOfShowToList(page);

    const row = overviewSessionRowById(page, fixture.sessionId);
    await expect(row).toBeVisible();
    await expect(row).toContainText(fixture.originalSessionTitle);
    await expect(row).toContainText(fixture.roomName);

    // Viewer-facing controls must not expose an edit path. The API remains the
    // authoritative boundary, so exercise it directly to prove a forged write
    // is rejected as well.
    await expect(page.getByTestId(`matrix-overview-session-edit-${fixture.sessionId}`)).toHaveCount(0);
    await expect(page.getByTestId(`matrix-overview-session-title-${fixture.sessionId}`)).toHaveCount(0);

    const response = await page.request.patch(
      `/api/events/${fixture.eventId}/matrix-2/sessions/${fixture.sessionId}`,
      { data: { title: fixture.deniedSessionTitle } },
    );
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Event editor role required",
      reason: "EVENT_EDITOR_ROLE_REQUIRED",
    });
    await expect(page.getByText("Session updated")).toHaveCount(0);

    const persisted = await fixture.harness.db.matrixRow.findUnique({
      where: { id: fixture.sessionId },
      select: { sessionName: true, roomId: true },
    });
    expect(persisted?.sessionName).toBe(fixture.originalSessionTitle);
    expect(persisted?.roomId).not.toBeNull();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Run of Show" })).toBeVisible();
    await switchRunOfShowToList(page);
    const reloadedRow = overviewSessionRowById(page, fixture.sessionId);
    await expect(reloadedRow).toBeVisible();
    await expect(reloadedRow).toContainText(fixture.originalSessionTitle);
    await expect(reloadedRow).not.toContainText(fixture.deniedSessionTitle);
  } finally {
    await fixture.harness.cleanup();
  }
});
