import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("app/api/events/[eventId]/matrix-rows/route.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("matrix-rows route imports the project-standard auth helpers", () => {
  assert.ok(routeSource.includes('from "@/lib/request-user"'));
  assert.ok(routeSource.includes("resolveRequestUser"));
  assert.ok(routeSource.includes("assertEventAccessForUser"));
  assert.ok(routeSource.includes("EventAccessError"));
});

test("matrix-rows POST resolves the request user and rejects unauthenticated callers", () => {
  const postSource = sourceBetween(routeSource, "async function postHandler", "export const GET");
  // Unauthenticated/unprovisioned requests are turned away before any work.
  assert.ok(postSource.includes("await resolveRequestUser(request)"));
  assert.ok(postSource.includes('if ("error" in currentUserResult)'));
  assert.ok(postSource.includes("toAuthErrorResponse"));
});

test("matrix-rows POST enforces event write access before creating a row", () => {
  const postSource = sourceBetween(routeSource, "async function postHandler", "export const GET");
  assert.ok(postSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "write")'));

  // Authorization must happen before the canonical create runs.
  const assertIndex = postSource.indexOf("assertEventAccessForUser");
  const createIndex = postSource.indexOf("createMatrixRow");
  assert.notEqual(assertIndex, -1);
  assert.notEqual(createIndex, -1);
  assert.ok(assertIndex < createIndex, "write access must be asserted before createMatrixRow");
});

test("matrix-rows GET enforces event read access", () => {
  const getSource = sourceBetween(routeSource, "async function getHandler", "async function postHandler");
  assert.ok(getSource.includes("await resolveRequestUser(request)"));
  assert.ok(getSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "read")'));
});

test("matrix-rows maps EventAccessError to its status so viewers/denied roles are rejected", () => {
  // EventAccessError carries 403 for EVENT_VIEWER / EVENT_EDITOR_ROLE_REQUIRED;
  // the route returns that status rather than 500.
  assert.ok(routeSource.includes("error instanceof EventAccessError"));
  const branch = sourceBetween(routeSource, "error instanceof EventAccessError", "MatrixError");
  assert.ok(branch.includes("status: error.status"));
});

test("matrix-rows preserves the authorized create path", () => {
  // The successful create behavior for authorized users is unchanged.
  assert.ok(routeSource.includes("const row = await createMatrixRow(eventId, body, { id: currentUserResult.user.id })"));
  assert.ok(routeSource.includes("{ status: 201 }"));
});
