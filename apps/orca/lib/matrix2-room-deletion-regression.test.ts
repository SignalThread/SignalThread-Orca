import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const roomsSource = readFileSync("lib/rooms.ts", "utf8");
const roomRouteSource = readFileSync("app/api/events/[eventId]/rooms/[roomId]/route.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("room editor exposes a separated, confirmed destructive action", () => {
  assert.match(pageSource, />\s*Delete room\s*</);
  assert.match(pageSource, /Deleting a room cannot be undone/);
  assert.match(pageSource, /Delete “\{editRoomName\.trim\(\) \|\| "this room"\}”\? This cannot be undone\./);
  assert.match(pageSource, /setIsDeleteRoomConfirmOpen\(true\)/);
  assert.match(pageSource, /setIsDeleteRoomConfirmOpen\(false\)/);
});

test("the canonical server service blocks deletion when sessions remain assigned", () => {
  const deleteRoomSource = sourceBetween(roomsSource, "export async function deleteRoom", "\n}");

  assert.match(deleteRoomSource, /getPrisma\(\)\.matrixRow\.count/);
  assert.match(deleteRoomSource, /eventId,\s*roomId,/);
  assert.match(deleteRoomSource, /This room contains \$\{sessionCount\} session/);
  assert.match(deleteRoomSource, /Reassign or remove those sessions before deleting it\./);
  assert.match(deleteRoomSource, /getPrisma\(\)\.room\.delete/);
});

test("DELETE is event-authorized and the board changes only after server success", () => {
  const deleteRouteSource = sourceBetween(roomRouteSource, "async function deleteRoomRoute", "export const DELETE");
  const deleteHandlerSource = sourceBetween(pageSource, "async function handleDeleteRoom", "const addSessionStartMinutes");

  assert.match(deleteRouteSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.match(deleteRouteSource, /await deleteRoom\(eventId, roomId\)/);
  assert.match(roomRouteSource, /export const DELETE = withApiRequestLogging/);
  assert.match(deleteHandlerSource, /method: "DELETE"/);
  assert.ok(deleteHandlerSource.indexOf("if (!response.ok)") < deleteHandlerSource.indexOf("setSnapshot"));
  assert.match(deleteHandlerSource, /rooms: current\.rooms\.filter\(\(room\) => room\.id !== deletedRoomId\)/);
  assert.match(deleteHandlerSource, /setFlashMessage\("Room deleted"\)/);
});

test("a room known to contain sessions never offers a client-side silent delete", () => {
  assert.match(pageSource, /This room contains \{editingRoomSessionCount\} session/);
  assert.match(pageSource, /editingRoomSessionCount === 0 \?/);
  assert.match(pageSource, /\{editingRoomSessionCount > 0 \? "Close" : "Cancel"\}/);
});
