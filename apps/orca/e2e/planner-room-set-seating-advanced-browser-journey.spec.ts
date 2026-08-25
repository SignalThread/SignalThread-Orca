import { expect, test } from "@playwright/test";
import {
  createPlannerRoomSetSeatingAdvancedBrowserFixture,
  ensureRoomSetSeatingMode,
  openEventWorkspace,
  openEventsList,
  openRunOfShow,
  openSessionSeatingWorkspace,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

// Remaining Prompt 5: expand Room Set / Seating browser coverage beyond exact-chair
// assignment to the unassign path. The attendee is pre-seated at Chair 1, then
// unassigned through the real Tables inspector chair "Remove" control, verified in
// the UI and by DB reread after reload.
//
// Multi-table and auto-assign advanced paths are not browser-covered here:
// auto-assign is explicitly deferred in the embedded seating V1, and multi-table
// moves depend on canvas drag/drop that would be brittle. These remain documented
// gaps (seating assignment scope is covered at the service/journey layer).

function occupiedChairRow(page: import("@playwright/test").Page, attendeeName: string) {
  return page.locator('[data-room-set-chair-drop-target="true"]').filter({ hasText: attendeeName });
}

test("Planner P0 Room Set advanced seating journey: unassign a seated attendee and verify removal", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerRoomSetSeatingAdvancedBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);

    await openSessionSeatingWorkspace(page, fixture.sessionId, fixture.sessionTitle);

    // Open the seated table and remove the attendee from their chair.
    await page.getByRole("button", { name: "Tables" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.tableName) }).click();
    const seatRow = occupiedChairRow(page, fixture.attendeeName);
    await expect(seatRow).toBeVisible();
    await seatRow.getByRole("button", { name: "Remove" }).click();

    // The chair no longer holds the attendee.
    await expect(occupiedChairRow(page, fixture.attendeeName)).toHaveCount(0);

    // DB reread proves the assignment was removed.
    await expect
      .poll(async () =>
        fixture.harness.db.seatingAssignment.count({
          where: {
            attendeeId: fixture.attendeeId,
            eventId: fixture.eventId,
            seatingPlanId: fixture.seatingPlanId,
            tableId: fixture.tableId,
          },
        }),
      )
      .toBe(0);

    // Reload and confirm the chair stays empty in the UI and DB.
    await page.reload();
    await ensureRoomSetSeatingMode(page);
    await page.getByRole("button", { name: "Tables" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.tableName) }).click();
    await expect(occupiedChairRow(page, fixture.attendeeName)).toHaveCount(0);

    const remaining = await fixture.harness.db.seatingAssignment.count({
      where: {
        attendeeId: fixture.attendeeId,
        eventId: fixture.eventId,
        seatingPlanId: fixture.seatingPlanId,
        tableId: fixture.tableId,
      },
    });
    expect(remaining).toBe(0);
  } finally {
    await fixture.harness.db.seatingAssignment.deleteMany({
      where: {
        attendeeId: fixture.attendeeId,
        eventId: fixture.eventId,
        seatingPlanId: fixture.seatingPlanId,
        tableId: fixture.tableId,
      },
    });
    await fixture.harness.cleanup();
  }
});
