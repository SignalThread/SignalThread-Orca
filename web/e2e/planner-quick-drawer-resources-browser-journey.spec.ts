import { expect, test } from "@playwright/test";
import {
  createPlannerQuickDrawerResourcesBrowserFixture,
  openEventWorkspace,
  openEventsList,
  openRunOfShow,
  openSessionQuickPanel,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

// Remaining Prompt 2: extend the Matrix quick drawer browser coverage from the
// already-covered Speakers panel to the F&B and Staffing assignment panels.
// The panels share one authenticated planner session (the dev-auth email is fixed
// per run), so they are exercised sequentially in a single owned journey. Each
// assignment is driven through the real drawer UI, verified in the UI after
// reload, and confirmed by rereading the canonical DB record.
//
// AV panel note: the AV requirement panel is intentionally not browser-covered
// here. Saving an AV requirement selection budget-links the requirement and the
// event resolves a broader default requirement template, so the reloaded AV panel
// does not re-render a stable, matchable "selected" row. Forcing that assertion
// would create brittle coverage; AV requirement browser coverage remains a
// documented gap (the AV data path is covered at the service/journey layer).

test("Planner P0 quick drawer resources journey: assign F&B and Staffing through the real drawer", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerQuickDrawerResourcesBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);

    // 1) F&B — catalog assignment persists immediately through the canonical route.
    const fnbPanel = await openSessionQuickPanel(page, fixture.sessionId, fixture.sessionTitle, "F&B", "F&B");
    await expect(fnbPanel.getByText("No F&B items selected")).toBeVisible();
    await fnbPanel.getByRole("button", { name: `Add ${fixture.fnbItemName}` }).click();
    await expect(fnbPanel.getByRole("button", { name: `Remove ${fixture.fnbItemName}` })).toBeVisible();
    await page.getByRole("button", { name: "Close session details" }).click();
    await expect(page.getByRole("region", { name: "F&B quick panel" })).toHaveCount(0);

    // 2) Staffing — event-person assignment persists through the session Save.
    const staffingPanel = await openSessionQuickPanel(page, fixture.sessionId, fixture.sessionTitle, "Staffing", "Staffing");
    await expect(staffingPanel.getByText("No staffing needs or crew selected")).toBeVisible();
    await staffingPanel.getByRole("button", { name: `Add ${fixture.staffPersonName}` }).click();
    await expect(staffingPanel.getByRole("button", { name: `Remove ${fixture.staffPersonName}` })).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Session updated")).toBeVisible();
    await page.getByRole("button", { name: "Close session details" }).click();

    // Reload and verify both assignments remain visible in the real UI.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Run of Show" })).toBeVisible();

    const reloadedFnb = await openSessionQuickPanel(page, fixture.sessionId, fixture.sessionTitle, "F&B", "F&B");
    await expect(reloadedFnb.getByRole("button", { name: `Remove ${fixture.fnbItemName}` })).toBeVisible();
    await page.getByRole("button", { name: "Close session details" }).click();

    const reloadedStaffing = await openSessionQuickPanel(page, fixture.sessionId, fixture.sessionTitle, "Staffing", "Staffing");
    await expect(reloadedStaffing.getByRole("button", { name: `Remove ${fixture.staffPersonName}` })).toBeVisible();

    // Reread the canonical DB records to prove persistence.
    const fnbAssignment = await fixture.harness.db.sessionFnbCatalogAssignment.findFirst({
      where: { sessionId: fixture.sessionId, eventFnbCatalogItemId: fixture.fnbItemId },
      select: { sessionId: true, eventFnbCatalogItemId: true },
    });
    expect(fnbAssignment).toEqual({
      sessionId: fixture.sessionId,
      eventFnbCatalogItemId: fixture.fnbItemId,
    });

    // Staff persistence: this database stores Matrix session staff in the raw
    // "MatrixRowStaffAssignment" table; the SessionStaffAssignment Prisma model is
    // not migrated here (the harness cleans both). Try the delegate, then fall back
    // to the raw table so the reread is portable.
    const staffAssignmentExists = await (async () => {
      try {
        const staff = await fixture.harness.db.sessionStaffAssignment.findFirst({
          where: { sessionId: fixture.sessionId, personId: fixture.staffPersonId },
          select: { sessionId: true },
        });
        if (staff) return true;
      } catch {
        // SessionStaffAssignment table may not exist in this DB; fall through.
      }
      try {
        const rows = await fixture.harness.db.$queryRawUnsafe<Array<{ one: number }>>(
          `SELECT 1 AS one FROM "MatrixRowStaffAssignment" WHERE "matrixRowId" = $1::uuid AND "eventPersonId" = $2::uuid`,
          fixture.sessionId,
          fixture.staffPersonId,
        );
        return rows.length > 0;
      } catch {
        return false;
      }
    })();
    expect(staffAssignmentExists).toBe(true);
  } finally {
    await fixture.harness.cleanup();
  }
});
