import { expect, test } from "@playwright/test";
import {
  createPlannerRoomSetSeatingBrowserFixture,
  ensureRoomSetSeatingMode,
  openEventWorkspace,
  openEventsList,
  openRunOfShow,
  openSessionSeatingWorkspace,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test("Planner P0 Room Set seating journey: assign attendee to a chair and verify persistence", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerRoomSetSeatingBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);

    await openSessionSeatingWorkspace(page, fixture.sessionId, fixture.sessionTitle);
    await expect(page.getByText(fixture.sessionTitle).first()).toBeVisible();
    await expect(page.getByText(fixture.attendeeName).first()).toBeVisible();

    await page.getByRole("button", { name: new RegExp(fixture.attendeeName) }).click();
    await expect(page.getByText(`Drop on an open chair, or click a chair, to seat ${fixture.attendeeName}.`)).toBeVisible();

    await page.getByRole("button", { name: "Tables" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.tableName) }).click();
    await expect(page.getByText("Seating Inspector")).toBeVisible();
    await expect(page.getByRole("button", { name: `Assign ${fixture.attendeeName} to Chair 1` })).toBeVisible();
    const assignmentResponsePromise = page.waitForResponse((response) => (
      response.url().includes(`/api/events/${fixture.eventId}/seating/assign`) &&
      response.request().method() === "POST"
    ));
    await page.getByRole("button", { name: `Assign ${fixture.attendeeName} to Chair 1` }).click();
    const assignmentResponse = await assignmentResponsePromise;
    expect(assignmentResponse.status(), await assignmentResponse.text()).toBe(200);

    await expect(page.getByText("Chair 1")).toBeVisible();
    await expect(page.getByText(fixture.attendeeName).first()).toBeVisible();

    await page.getByRole("button", { name: "Close seating inspector" }).click();
    await expect(page.getByText("Seating Inspector")).toHaveCount(0);

    await page.getByRole("button", { name: "Tables" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.tableName) }).click();
    await expect(page.getByText("Chair 1")).toBeVisible();
    await expect(page.getByText(fixture.attendeeName).first()).toBeVisible();

    await page.reload();
    await ensureRoomSetSeatingMode(page);
    await page.getByRole("button", { name: "Tables" }).click();
    await page.getByRole("button", { name: new RegExp(fixture.tableName) }).click();
    await expect(page.getByText("Chair 1")).toBeVisible();
    await expect(page.getByText(fixture.attendeeName).first()).toBeVisible();

    const assignment = await fixture.harness.db.seatingAssignment.findFirst({
      where: {
        attendeeId: fixture.attendeeId,
        eventId: fixture.eventId,
        seatingPlanId: fixture.seatingPlanId,
        tableId: fixture.tableId,
      },
      select: {
        attendeeId: true,
        eventId: true,
        seatingPlanId: true,
        seatIndex: true,
        tableId: true,
      },
    });
    expect(assignment).toEqual({
      attendeeId: fixture.attendeeId,
      eventId: fixture.eventId,
      seatingPlanId: fixture.seatingPlanId,
      seatIndex: fixture.expectedSeatIndex,
      tableId: fixture.tableId,
    });
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

test("development keeps every Room Set and Seating renderer interactive", async ({ baseURL, context, page }) => {
  const fixture = await createPlannerRoomSetSeatingBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);
    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);

    await page.locator(`[data-matrix2-session-card-id="${fixture.sessionId}"]`).click();
    const launcher = page.getByRole("group", { name: `Quick actions for ${fixture.sessionTitle}` });
    await expect(launcher.getByRole("button", { name: "Room Set", exact: true })).toBeVisible();
    await expect(launcher.getByRole("button", { name: "Seating", exact: true })).toBeVisible();
    await expect(launcher.getByText("Coming soon")).toHaveCount(0);

    await launcher.getByRole("button", { name: "Room Set", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}/room-set\\?mode=layout`));

    await page.goto(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}`);
    const workspaceTab = page.locator('nav[aria-label="Session modules"] a', { hasText: "Room Set & Seating" });
    const workspaceCard = page.locator('[data-session-module-card="room-set"]');
    await expect(workspaceTab).toHaveAttribute("href", new RegExp("room-set\\?mode=layout"));
    await expect(workspaceCard).toHaveAttribute("href", new RegExp("room-set\\?mode=layout"));
    await expect(workspaceCard.getByText("Open Room Set editor")).toBeVisible();
    await expect(page.getByText("Coming soon")).toHaveCount(0);

    await workspaceCard.click();
    await expect(page).toHaveURL(new RegExp(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}/room-set\\?mode=layout`));
    await page.goto(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}`);
    await page.locator('nav[aria-label="Session modules"] a', { hasText: "Room Set & Seating" }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${fixture.eventId}/matrix/sessions/${fixture.sessionId}/room-set\\?mode=layout`));
  } finally {
    await fixture.harness.cleanup();
  }
});
