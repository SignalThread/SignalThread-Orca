import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MATRIX2_TEMPLATES } from "../app/(shell)/matrix-2/_components/types";

const matrix2PageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const matrix2BoardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const matrix2ConflictSource = readFileSync("app/(shell)/matrix-2/_components/conflict-utils.ts", "utf8");
const matrix2ServiceSource = readFileSync("lib/matrix2.ts", "utf8");
const matrix2SessionServiceSource = readFileSync("lib/matrix2-session.ts", "utf8");
const matrixRowsServiceSource = readFileSync("lib/matrix.ts", "utf8");
const matrixRowRouteSource = readFileSync("app/api/events/[eventId]/matrix-rows/[rowId]/route.ts", "utf8");
const matrix2SessionRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/route.ts", "utf8");
const roomsRouteSource = readFileSync("app/api/events/[eventId]/rooms/route.ts", "utf8");
const roomUpdateRouteSource = readFileSync("app/api/events/[eventId]/rooms/[roomId]/route.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Run of Show add session flow can create a session before rooms exist", () => {
  const addSessionSource = sourceBetween(matrix2PageSource, "const handleCreateAddSession", "const handleOverviewSort");

  assert.equal(addSessionSource.includes("Create a room first, then add sessions."), false);
  assert.match(addSessionSource, /const room = addSessionRoomId/);
  assert.match(addSessionSource, /roomId: room\?\.id \?\? null/);
});

test("template-created sessions do not auto-apply module presets or placeholder data", () => {
  const createSource = sourceBetween(matrix2PageSource, "const createSessionFromTemplate", "const handleSaveSessionEdit");

  assert.match(createSource, /meal: ""/);
  assert.match(createSource, /avNeeds: ""/);
  assert.match(createSource, /setup: ""/);
  assert.match(createSource, /attendance: null/);
  assert.match(createSource, /speakers: \[\]/);
  assert.match(createSource, /staffAssigned: \[\]/);
  assert.match(createSource, /foodAndBeverage: \[\]/);

  for (const template of MATRIX2_TEMPLATES) {
    assert.equal(template.defaultSetup, "", `${template.id} should not carry default room set presets`);
    assert.deepEqual(template.defaultAvNeeds, [], `${template.id} should not carry default AV presets`);
    assert.deepEqual(template.defaultSpeakers, [], `${template.id} should not carry placeholder speaker presets`);
    assert.deepEqual(template.defaultStaff, [], `${template.id} should not carry default staffing presets`);
    assert.deepEqual(template.defaultFnb, [], `${template.id} should not carry default F&B presets`);
    assert.equal(template.defaultMeal, "", `${template.id} should not carry default meal/F&B presets`);
    assert.equal(template.defaultAttendance, null, `${template.id} should not carry default attendance/seating presets`);
  }
});

test("unassigned sessions render clearly and can later be assigned to an event room", () => {
  assert.match(matrix2PageSource, /<option value="">Unassigned<\/option>/);
  assert.match(matrix2PageSource, /session\.roomName \|\| "Unassigned"/);
  assert.match(matrix2ServiceSource, /\?\? "Unassigned"/);
  assert.match(matrix2SessionServiceSource, /resolvedRoomId = null/);
  assert.match(matrix2SessionServiceSource, /resolvedRoomName = "Unassigned"/);
  assert.match(matrix2SessionServiceSource, /where: \{[\s\S]*id: requestedRoomId,[\s\S]*eventId,/);
  assert.match(matrix2ConflictSource, /isUnassignedRoom \? "" : normalizedRoomName/);
});

test("matrix row create and update preserve nullable room ids and clear stale room names", () => {
  assert.match(matrixRowsServiceSource, /roomId: string \| null/);
  assert.match(matrixRowsServiceSource, /roomId: row\.roomId/);
  assert.match(matrixRowsServiceSource, /where: \{ id: roomId, eventId \}/);
  assert.match(matrixRowsServiceSource, /hasRoomId \? null : undefined/);
});

test("room and matrix-row mutation routes enforce event access before writes", () => {
  const patchSource = sourceBetween(matrixRowRouteSource, "async function patchHandler", "async function deleteHandler");
  const deleteSource = sourceBetween(matrixRowRouteSource, "async function deleteHandler", "export const PATCH");
  const matrix2SessionPatchSource = sourceBetween(
    matrix2SessionRouteSource,
    "async function updateMatrix2SessionRoute",
    "export const PATCH",
  );
  const createRoomSource = sourceBetween(roomsRouteSource, "async function createRoomRoute", "export const GET");
  const listRoomSource = sourceBetween(roomsRouteSource, "async function listRoomsRoute", "async function createRoomRoute");
  const updateRoomSource = sourceBetween(roomUpdateRouteSource, "async function updateRoomRoute", "export const PATCH");

  assert.match(patchSource, /await resolveRequestUser\(request\)/);
  assert.match(patchSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.ok(patchSource.indexOf("assertEventAccessForUser") < patchSource.indexOf("updateMatrixRow"));

  assert.match(deleteSource, /await resolveRequestUser\(_request\)/);
  assert.match(deleteSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.ok(deleteSource.indexOf("assertEventAccessForUser") < deleteSource.indexOf("deleteMatrixRow"));

  assert.match(matrix2SessionPatchSource, /await resolveRequestUser\(nextRequest\)/);
  assert.match(matrix2SessionPatchSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.ok(matrix2SessionPatchSource.indexOf("assertEventAccessForUser") < matrix2SessionPatchSource.indexOf("const updated = await updateMatrix2Session"));

  assert.match(listRoomSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "read"\)/);
  assert.match(createRoomSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.ok(createRoomSource.indexOf("assertEventAccessForUser") < createRoomSource.indexOf("const room = await createRoom"));

  assert.match(updateRoomSource, /await resolveRequestUser\(nextRequest\)/);
  assert.match(updateRoomSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.ok(updateRoomSource.indexOf("assertEventAccessForUser") < updateRoomSource.indexOf("const room = await updateRoom"));
});

test("zero-room board state offers Add room without blocking session creation", () => {
  assert.match(matrix2BoardSource, />No rooms yet</);
  assert.match(matrix2BoardSource, />You can add sessions now and assign rooms later\.</);
  assert.match(matrix2BoardSource, />\s*Add room\s*</);

  const createRoomSource = sourceBetween(matrix2PageSource, "async function handleCreateRoom", "async function handleUpdateRoom");
  assert.match(createRoomSource, /Room name is required/);
  assert.match(createRoomSource, /const refreshedSnapshot = await loadSnapshot\(selectedEventId\)/);
  assert.match(createRoomSource, /if \(!refreshedSnapshot\)/);
  assert.match(createRoomSource, /setPendingCreatedRoomName\(normalizedName\)/);
  assert.match(createRoomSource, /Retry refresh before creating another room/);
  assert.ok(
    createRoomSource.indexOf("if (!refreshedSnapshot)") < createRoomSource.indexOf("setIsAddRoomOpen(false)"),
    "room success must wait for a confirmed snapshot reload",
  );
  assert.match(matrix2PageSource, /pendingCreatedRoomName \? "Refresh required"/);
  assert.match(matrix2PageSource, /retryCreatedRoomRefresh/);
});
