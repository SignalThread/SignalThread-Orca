import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seatingGetRouteSource = readFileSync("app/api/events/[eventId]/seating/route.ts", "utf8");
const seatingAssignRouteSource = readFileSync("app/api/events/[eventId]/seating/assign/route.ts", "utf8");
const seatingUnassignRouteSource = readFileSync("app/api/events/[eventId]/seating/unassign/route.ts", "utf8");
const roomSetWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
  "utf8",
);
const plannerCanvasSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
  "utf8",
);
const eventSeatingRouteSource = readFileSync("app/(shell)/events/[eventId]/seating/page.tsx", "utf8");
const standaloneSeatingRouteSource = readFileSync("app/(shell)/seating/page.tsx", "utf8");

test("seating API routes expose scoped GET, assign, and unassign contracts", () => {
  assert.equal(seatingGetRouteSource.includes('request.nextUrl.searchParams.get("matrixRowId")'), true);
  assert.equal(seatingGetRouteSource.includes('request.nextUrl.searchParams.get("seatingPlanId")'), true);
  assert.equal(seatingGetRouteSource.includes("getSeatingSnapshot(eventId, { matrixRowId, seatingPlanId })"), true);
  assert.equal(seatingAssignRouteSource.includes("assignAttendeeToTable(eventId, attendeeId, tableId, seatIndex, {"), true);
  assert.equal(seatingAssignRouteSource.includes("matrixRowId,"), true);
  assert.equal(seatingAssignRouteSource.includes("seatingPlanId,"), true);
  assert.equal(seatingAssignRouteSource.includes("requireScopedContext,"), true);
  assert.equal(seatingUnassignRouteSource.includes("unassignAttendee(eventId, attendeeId, {"), true);
  assert.equal(seatingUnassignRouteSource.includes("matrixRowId,"), true);
  assert.equal(seatingUnassignRouteSource.includes("seatingPlanId,"), true);
  assert.equal(seatingUnassignRouteSource.includes("requireScopedContext,"), true);
});

test("seating API routes return clear errors from seating service failures", () => {
  for (const source of [seatingGetRouteSource, seatingAssignRouteSource, seatingUnassignRouteSource]) {
    assert.equal(source.includes("error instanceof SeatingError"), true);
    assert.equal(source.includes("NextResponse.json({ error: error.message }, { status: error.status })"), true);
  }
});

test("retired standalone Seating surfaces redirect instead of exposing the old module", () => {
  assert.equal(eventSeatingRouteSource.includes("redirect(`/events/${eventId}/matrix`)"), true);
  assert.equal(eventSeatingRouteSource.includes("getSeatingSnapshot"), false);
  assert.equal(standaloneSeatingRouteSource.includes('redirect("/events")'), true);
  assert.equal(standaloneSeatingRouteSource.includes("assignAttendeeToTable"), false);
});

test("Room Set layout authoring actions and component hooks remain exposed", () => {
  assert.equal(roomSetWorkspaceSource.includes("Save draft"), true);
  assert.equal(roomSetWorkspaceSource.includes("Generate New Layout"), true);
  assert.equal(roomSetWorkspaceSource.includes("Apply to Current Layout"), true);
  assert.equal(roomSetWorkspaceSource.includes("revisePrototypeSceneLedger"), true);
  assert.equal(plannerCanvasSource.includes("deleteSelectedObject"), true);
  assert.equal(plannerCanvasSource.includes("onDraftSceneChange"), true);
  assert.equal(plannerCanvasSource.includes("selectedObject"), true);
});

test("Room Set seating UI remains session-scoped and auto-assign stays deferred", () => {
  assert.equal(roomSetWorkspaceSource.includes("Session-scoped seating for this {terminology.runOfShow} item."), true);
  assert.equal(roomSetWorkspaceSource.includes("Session-scoped seating plan active. Chair assignments persist for this ${terminology.runOfShow} session."), true);
  assert.equal(roomSetWorkspaceSource.includes("Auto-assign is deferred in embedded V1."), true);
  assert.equal(roomSetWorkspaceSource.includes("Bulk assignment tools are deferred for a later Room Set pass."), true);
});

test("Room Set inspector and canvas clear or pass seating overlay state safely", () => {
  assert.equal(roomSetWorkspaceSource.includes("Seating Inspector"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSelectedSeatingObjectIdLedger(null);"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSelectedSeatingTableIdLedger(null);"), true);
  assert.equal(roomSetWorkspaceSource.includes("seatingOverlays={seatingOverlayByObjectIdLedger}"), true);
  assert.equal(plannerCanvasSource.includes("seatingOverlay={seatingOverlays[object.id] ?? null}"), true);
  assert.equal(plannerCanvasSource.includes("data-room-set-chair-drop-target"), true);
  assert.equal(plannerCanvasSource.includes("plannerSeatPositionsForTable"), true);
  assert.equal(plannerCanvasSource.includes("plannerSeatPositionsForChairBlock"), true);
});
