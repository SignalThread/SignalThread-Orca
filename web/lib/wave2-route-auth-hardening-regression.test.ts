import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertBefore(source: string, left: string, right: string): void {
  const leftIndex = source.indexOf(left);
  const rightIndex = source.indexOf(right);
  assert.notEqual(leftIndex, -1, `Missing expected guard: ${left}`);
  assert.notEqual(rightIndex, -1, `Missing expected operation: ${right}`);
  assert.ok(leftIndex < rightIndex, `${left} must run before ${right}`);
}

function assertRouteGuard(path: string, accessType: "read" | "write", operation: string): void {
  const source = readSource(path);
  assert.ok(source.includes("requireEventRouteAccess"), `${path} must import/use the event route guard`);
  const guardMatch = new RegExp(`requireEventRouteAccess\\([^,]+,\\s*eventId,\\s*"${accessType}"\\)`).exec(source);
  assert.ok(guardMatch, `${path} must enforce ${accessType} event access`);
  const operationIndex = source.indexOf(operation, guardMatch.index + guardMatch[0].length);
  assert.notEqual(operationIndex, -1, `Missing expected operation: ${operation}`);
  assert.ok(guardMatch.index < operationIndex, `${path} must enforce ${accessType} access before ${operation}`);
}

test("Wave 2 core event detail route enforces read/write access before event operations", () => {
  const source = readSource("app/api/events/[eventId]/route.ts");
  const getSource = sourceBetween(source, "async function getEventRoute", "async function updateEventRoute");
  const patchSource = sourceBetween(source, "async function updateEventRoute", "async function deleteEventRoute");

  assertBefore(getSource, 'requireEventRouteAccess(nextRequest, eventId, "read")', "getEventById(eventId)");
  assertBefore(patchSource, 'requireEventRouteAccess(nextRequest, eventId, "write")', "nextRequest.json()");
  assertBefore(patchSource, 'requireEventRouteAccess(nextRequest, eventId, "write")', "updateEvent(eventId, data, actorUserId");
});

test("Wave 2 F&B catalog routes enforce event read/write access before service or parser work", () => {
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/route.ts", "read", "getFnbCatalogPayload(eventId)");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/route.ts", "write", "request.json()");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/[itemId]/route.ts", "write", "request.json()");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/[itemId]/route.ts", "write", "archiveFnbCatalogItem");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/parser-feedback/route.ts", "write", "request.json()");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/source-menus/[sourceMenuId]/route.ts", "write", "request.json()");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/source-menus/[sourceMenuId]/route.ts", "write", "deleteFnbSourceMenu");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/parse-menu/presign/route.ts", "write", "request.json()");
  assertRouteGuard("app/api/events/[eventId]/fnb-catalog/parse-menu/route.ts", "write", "ensureEventExists(eventId)");

  const fnbSource = readSource("lib/fnb-catalog.ts");
  assert.match(fnbSource, /where:\s*\{\s*id: sourceMenuId,\s*eventId[\s\S]*?\}/);
  assert.match(fnbSource, /where:\s*\{\s*id: itemId,\s*eventId,\s*archivedAt: null[\s\S]*?\}/);
});

test("Wave 2 Matrix 2 people and requirement routes enforce event access before mutations", () => {
  assertRouteGuard("app/api/events/[eventId]/matrix-2/people/route.ts", "read", "listMatrix2People(eventId)");
  assertRouteGuard("app/api/events/[eventId]/matrix-2/people/route.ts", "write", "nextRequest.json()");
  assertRouteGuard(
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/requirements/[itemId]/route.ts",
    "write",
    "removeSessionRequirementSelection",
  );
  assertRouteGuard(
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/requirements/[itemId]/budget-link/route.ts",
    "write",
    "request.json()",
  );
  assertRouteGuard(
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/requirements/[itemId]/budget-link/route.ts",
    "write",
    "updateSessionRequirementBudgetLink",
  );

  const requirementsSource = readSource("lib/session-requirements.ts");
  assert.match(requirementsSource, /matrixRow\.findFirst\(\{\s*where:\s*\{\s*id: input\.sessionId,\s*eventId: input\.eventId/);
  assert.match(requirementsSource, /sessionRequirementItem\.findFirst\(\{\s*where:\s*\{\s*id: input\.itemId[\s\S]*?template:\s*\{\s*eventId: input\.eventId/);
  assert.match(requirementsSource, /budgetLineItem\.findFirst\(\{\s*where:\s*\{\s*id: input\.budgetLineItemId[\s\S]*?budget:\s*\{\s*eventId: input\.eventId/);
});

test("Wave 2 seating routes enforce event write access and preserve same-event child checks", () => {
  assertRouteGuard("app/api/events/[eventId]/seating/tables/route.ts", "write", "request.json()");
  assertRouteGuard("app/api/events/[eventId]/seating/tables/[tableId]/route.ts", "write", "request.json()");
  assertRouteGuard("app/api/events/[eventId]/seating/tables/[tableId]/route.ts", "write", "deleteSeatingTable");
  assertRouteGuard("app/api/events/[eventId]/seating/attendees/route.ts", "write", "request.json()");

  const seatingSource = readSource("lib/seating.ts");
  assert.match(seatingSource, /seatingTable\.findFirst\(\{\s*where:\s*\{\s*id: tableId,\s*eventId/);
  assert.match(seatingSource, /seatingAttendee\.findFirst\(\{\s*where:\s*\{\s*id: attendeeId,\s*eventId/);
});

test("Wave 2 session requirement template routes enforce event read/write access", () => {
  assertRouteGuard("app/api/events/[eventId]/session-requirements/template/route.ts", "read", "getEventSessionRequirementTemplate(eventId)");
  assertRouteGuard("app/api/events/[eventId]/session-requirements/template/route.ts", "write", "request.json()");
  assertRouteGuard(
    "app/api/events/[eventId]/session-requirements/template/sections/[sectionId]/items/route.ts",
    "write",
    "request.json()",
  );

  const requirementsSource = readSource("lib/session-requirements.ts");
  assert.match(requirementsSource, /sessionRequirementSection\.findFirst\(\{\s*where:\s*\{\s*id: sectionId[\s\S]*?template:\s*\{\s*eventId/);
});

test("Wave 2 legacy Matrix and document category routes are guarded before data access", () => {
  assertRouteGuard("app/api/events/[eventId]/matrix-rows/[rowId]/duplicate/route.ts", "write", "duplicateMatrixRow(eventId, rowId, { id: auth.user.id })");
  assertRouteGuard("app/api/events/[eventId]/matrix-rows/export.csv/route.ts", "read", "exportMatrixRowsCsv(eventId");
  assertRouteGuard("app/api/events/[eventId]/document-categories/route.ts", "read", "listDocumentCategoriesForEvent(eventId)");
  assertRouteGuard("app/api/events/[eventId]/document-categories/route.ts", "write", "request.json()");

  const matrixSource = readSource("lib/matrix.ts");
  assert.match(matrixSource, /matrixRow\.findFirst\(\{\s*where:\s*\{\s*id: rowId,\s*eventId/);
  assert.match(matrixSource, /exportMatrixRowsCsv\(eventId[\s\S]*?listMatrixRows\(eventId/);
});
