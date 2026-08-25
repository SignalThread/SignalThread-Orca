import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression coverage for Event Builder Additional Docs Pass 1 (Prompt 1):
// the existing Docs Hub upload path must enforce event read/write access
// server-side through the canonical helpers before being reused by Event Builder.

const documentsRouteSource = readFileSync(
  "app/api/events/[eventId]/documents/route.ts",
  "utf8",
);
const presignRouteSource = readFileSync(
  "app/api/events/[eventId]/documents/presign/route.ts",
  "utf8",
);
const finalizeRouteSource = readFileSync(
  "app/api/events/[eventId]/documents/[documentId]/finalize-upload/route.ts",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("docs upload routes import the project-standard event-access helpers", () => {
  for (const source of [documentsRouteSource, presignRouteSource, finalizeRouteSource]) {
    assert.ok(source.includes('from "@/lib/request-user"'));
    assert.ok(source.includes('from "@/lib/event-access"'));
    assert.ok(source.includes("resolveRequestUser"));
    assert.ok(source.includes("assertEventAccessForUser"));
    assert.ok(source.includes("EventAccessError"));
  }
});

test("documents GET (list) enforces event read access", () => {
  const getSource = sourceBetween(documentsRouteSource, "async function getHandler", "async function postHandler");
  assert.ok(getSource.includes("await resolveRequestUser(request)"));
  assert.ok(getSource.includes('if ("error" in currentUserResult)'));
  assert.ok(getSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "read")'));

  // Authorization must precede the canonical list read.
  const assertIndex = getSource.indexOf("assertEventAccessForUser");
  const listIndex = getSource.indexOf("await listDocumentsForEvent(");
  assert.ok(assertIndex !== -1 && listIndex !== -1);
  assert.ok(assertIndex < listIndex, "read access must be asserted before listDocumentsForEvent");
});

test("documents POST (create draft) enforces event write access before creating", () => {
  const postSource = sourceBetween(documentsRouteSource, "async function postHandler", "export const GET");
  assert.ok(postSource.includes("await resolveRequestUser(request)"));
  assert.ok(postSource.includes('if ("error" in currentUserResult)'));
  assert.ok(postSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "write")'));

  const assertIndex = postSource.indexOf("assertEventAccessForUser");
  const createIndex = postSource.indexOf("await createDocumentDraft(");
  assert.ok(assertIndex !== -1 && createIndex !== -1);
  assert.ok(assertIndex < createIndex, "write access must be asserted before createDocumentDraft");
});

test("documents presign POST enforces event write access before presigning", () => {
  assert.ok(presignRouteSource.includes("await resolveRequestUser(request)"));
  assert.ok(presignRouteSource.includes('if ("error" in currentUserResult)'));
  assert.ok(presignRouteSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "write")'));

  const assertIndex = presignRouteSource.indexOf("assertEventAccessForUser");
  const presignIndex = presignRouteSource.indexOf("await createDocumentUploadPresign(");
  assert.ok(assertIndex !== -1 && presignIndex !== -1);
  assert.ok(assertIndex < presignIndex, "write access must be asserted before createDocumentUploadPresign");
});

test("documents finalize-upload POST enforces event write access before finalizing", () => {
  assert.ok(finalizeRouteSource.includes("await resolveRequestUser(request)"));
  assert.ok(finalizeRouteSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "write")'));

  const assertIndex = finalizeRouteSource.indexOf("assertEventAccessForUser");
  const finalizeIndex = finalizeRouteSource.indexOf("await finalizeDocumentUpload(");
  assert.ok(assertIndex !== -1 && finalizeIndex !== -1);
  assert.ok(assertIndex < finalizeIndex, "write access must be asserted before finalizeDocumentUpload");
});

test("docs upload routes map EventAccessError to its status so viewers/denied roles are rejected", () => {
  // EventAccessError carries 403 for EVENT_VIEWER / EVENT_EDITOR_ROLE_REQUIRED;
  // the routes return that status (not 500) so read-only users cannot upload.
  for (const source of [documentsRouteSource, presignRouteSource, finalizeRouteSource]) {
    assert.ok(source.includes("error instanceof EventAccessError"));
    const branch = sourceBetween(source, "error instanceof EventAccessError", "status: error.status");
    assert.ok(branch.length > 0);
  }
});

test("docs upload routes preserve the authorized Docs Hub create/version path", () => {
  // Authorized planners/admins still reach the canonical document/version services unchanged.
  assert.ok(documentsRouteSource.includes("const document = await createDocumentDraft(eventId, body, { id: currentUserResult.user.id })"));
  assert.ok(documentsRouteSource.includes("{ status: 201 }"));
  assert.ok(presignRouteSource.includes("await createDocumentUploadPresign(eventId, body)"));
  assert.ok(
    finalizeRouteSource.includes(
      "await finalizeDocumentUpload(eventId, documentId, body, currentUserResult.user.id)",
    ),
  );
  assert.ok(finalizeRouteSource.includes("{ status: 201 }"));
});
