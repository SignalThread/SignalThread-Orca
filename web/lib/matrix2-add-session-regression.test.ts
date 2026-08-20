import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matrix2PageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const matrix2TopStripSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx", "utf8");
const matrixServiceSource = readFileSync("lib/matrix.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Add session modal is a single-session scheduling flow", () => {
  const modalSource = sourceBetween(matrix2PageSource, "{isAddSessionOpen ? (", "{isAddRoomOpen ? (");
  const createSource = sourceBetween(matrix2PageSource, "const handleCreateAddSession", "const handleOverviewSort");

  assert.doesNotMatch(modalSource, />Quantity</);
  assert.doesNotMatch(modalSource, />Duration</);
  assert.match(modalSource, />Start time</);
  assert.match(modalSource, />End time</);
  assert.match(modalSource, /Choose a type and schedule the session\./);
  assert.match(modalSource, /max-h-\[calc\(100dvh-2rem\)\].*overflow-y-auto/);
  assert.match(modalSource, /disabled=\{isMutating \|\| Boolean\(pendingCreatedSession\) \|\| !isAddSessionTimeRangeValid\}/);
  assert.match(modalSource, /Create session/);

  assert.doesNotMatch(createSource, /for \(/);
  assert.doesNotMatch(createSource, /quantity/);
  assert.match(createSource, /const response = await fetch\(`\/api\/events\/\$\{selectedEventId\}\/matrix-rows`/);
  assert.match(createSource, /startTime: addSessionStartTime/);
  assert.match(createSource, /endTime: addSessionEndTime/);
  assert.match(createSource, /sessionName: sessionType/);
  assert.match(createSource, /const refreshedSnapshot = await loadSnapshot\(selectedEventId\)/);
  assert.match(createSource, /if \(!refreshedSnapshot\)/);
  assert.match(createSource, /setPendingCreatedSession\(\{ id: createdSessionId, sessionType \}\)/);
  assert.match(createSource, /Retry refresh before creating another session/);
  assert.match(createSource, /setIsAddSessionOpen\(false\)/);
  assert.ok(
    createSource.indexOf("if (!refreshedSnapshot)") < createSource.indexOf("setIsAddSessionOpen(false)"),
    "a session dialog must stay open until the snapshot confirms the new session",
  );
});

test("Add session is available only with a confirmed snapshot and has a refresh retry after a confirmed write", () => {
  const retrySource = sourceBetween(matrix2PageSource, "const retryCreatedSessionRefresh", "const handleOverviewSort");

  assert.match(matrix2TopStripSource, /hasSnapshot: boolean/);
  assert.match(matrix2TopStripSource, /disabled=\{isBusy \|\| !hasSnapshot\}/);
  assert.match(matrix2PageSource, /hasSnapshot=\{Boolean\(snapshot\)\}/);
  assert.match(matrix2PageSource, /pendingCreatedSession \? "Refresh required"/);
  assert.match(matrix2PageSource, /Retry refresh/);
  assert.match(retrySource, /const refreshedSnapshot = await loadSnapshot\(selectedEventId\)/);
  assert.match(retrySource, /if \(!refreshedSnapshot\)/);
  assert.match(retrySource, /setIsAddSessionOpen\(false\)/);
});

test("Add session keeps a one-hour default end until the end time is manually changed", () => {
  const openSource = sourceBetween(matrix2PageSource, "const handleOpenAddSession", "const handleAddSessionTypeChange");
  const startSource = sourceBetween(matrix2PageSource, "const handleAddSessionStartTimeChange", "const handleAddSessionEndTimeChange");
  const endSource = sourceBetween(matrix2PageSource, "const handleAddSessionEndTimeChange", "const handleCreateAddSession");

  assert.match(openSource, /DEFAULT_ADD_SESSION_DURATION_MINUTES/);
  assert.match(openSource, /setAddSessionEndTime\(minutesToTime\(startMinutes \+ DEFAULT_ADD_SESSION_DURATION_MINUTES\)\)/);
  assert.match(openSource, /setIsAddSessionEndTimeManuallyEdited\(false\)/);
  assert.match(startSource, /if \(!isAddSessionEndTimeManuallyEdited\)/);
  assert.match(startSource, /setAddSessionEndTime\(minutesToTime\(Math\.min\(startMinutes \+ DEFAULT_ADD_SESSION_DURATION_MINUTES, MAX_TIME_MINUTES\)\)\)/);
  assert.match(endSource, /setIsAddSessionEndTimeManuallyEdited\(true\)/);
});

test("client and canonical MatrixRow writes reject invalid session time ranges", () => {
  const createSource = sourceBetween(matrix2PageSource, "const handleCreateAddSession", "const handleOverviewSort");

  assert.match(createSource, /if \(endMinutes <= startMinutes\)/);
  assert.match(createSource, /End time must be later than start time\./);
  assert.match(matrix2PageSource, /const isAddSessionTimeRangeValid = addSessionTimeRangeError === null/);
  assert.match(matrixServiceSource, /if \(endTime\.getTime\(\) <= startTime\.getTime\(\)\)/);
  assert.match(matrixServiceSource, /new MatrixError\("endTime must be after startTime", 400\)/);
});
