import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync("src/server/services/speaker-documents.ts", "utf8");
const documentsServiceSource = readFileSync("src/server/services/documents.ts", "utf8");
const prismaSchemaSource = readFileSync("prisma/schema.prisma", "utf8");
const adminRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/documents/route.ts",
  "utf8",
);
const linkRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/documents/[requestId]/link-docs-hub/route.ts",
  "utf8",
);
const portalListRouteSource = readFileSync(
  "app/api/public/speaker-portal/[token]/documents/route.ts",
  "utf8",
);
const portalSubmitRouteSource = readFileSync(
  "app/api/public/speaker-portal/[token]/documents/[requestId]/route.ts",
  "utf8",
);
const portalComponentSource = readFileSync(
  "app/speaker-portal/[token]/_components/speaker-portal-documents.tsx",
  "utf8",
);
const plannerSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-documents-section.tsx",
  "utf8",
);
const migrationSource = readFileSync(
  "test-fixtures/legacy-orca-migrations/20260611140000_add_speaker_document_requests/migration.sql",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("SpeakerDocumentRequest is event/speaker scoped and links to canonical Docs Hub document", () => {
  const modelSource = sourceBetween(prismaSchemaSource, "model SpeakerDocumentRequest {", "model ");
  assert.equal(modelSource.includes("eventId           String       @db.Uuid"), true);
  assert.equal(modelSource.includes("speakerId         String       @db.Uuid"), true);
  assert.equal(modelSource.includes("documentId        String?      @db.Uuid"), true);
  assert.equal(modelSource.includes("speakerFileId     String?      @db.Uuid"), true);
  assert.equal(modelSource.includes("Json"), false, "no JSON blobs for document requests");
  // Status must not be stored — it is derived from canonical sources.
  assert.equal(modelSource.includes("status"), false, "request status must be derived, not stored");
  assert.equal(migrationSource.includes("DROP"), false, "migration must stay additive");
  assert.equal(prismaSchemaSource.includes("SPEAKER"), true);
});

test("document request status is derived from Docs Hub first, then speaker file review", () => {
  const deriveSource = sourceBetween(serviceSource, "function deriveSpeakerDocumentStatus", "export type SpeakerDocumentRequestAdminRecord");
  assert.equal(deriveSource.indexOf("row.document") < deriveSource.indexOf("row.speakerFile"), true, "Docs Hub status must win over local review status");
  assert.equal(deriveSource.includes('"IN_REVIEW"'), true);
  assert.equal(deriveSource.includes('"APPROVED"'), true);
  assert.equal(deriveSource.includes('"REJECTED"'), true);
  assert.equal(deriveSource.includes('"ASSIGNED"'), true);
  // No local approval mutation exists anywhere in the service.
  assert.equal(serviceSource.includes("document.update"), false, "must not mutate Docs Hub documents directly");
  assert.equal(serviceSource.includes("documentApproval"), false, "must not fork Docs Hub approval logic");
});

test("planner document request routes authenticate and enforce event scope server-side", () => {
  for (const source of [adminRouteSource, linkRouteSource]) {
    assert.equal(source.includes("resolveRequestUser(request)"), true);
  }

  const listSource = sourceBetween(serviceSource, "export async function listSpeakerDocumentRequests", "export async function createSpeakerDocumentRequest");
  assert.equal(listSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(listSource.includes("await assertSpeakerInEvent(eventId, speakerId)"), true);

  const createSource = sourceBetween(serviceSource, "export async function createSpeakerDocumentRequest", "export async function linkSpeakerDocumentToDocsHub");
  assert.equal(createSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(createSource.includes("createdByUserId: user.id"), true);
  assert.equal(createSource.includes("logSpeakerActivity("), true, "assignment must be audited");
});

test("Docs Hub linking goes through canonical Docs Hub services with a SPEAKER link", () => {
  const linkSource = sourceBetween(serviceSource, "export async function linkSpeakerDocumentToDocsHub", "export async function listPortalSpeakerDocumentRequests");
  assert.equal(linkSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(linkSource.includes("id: requestId, eventId, speakerId"), true);
  assert.equal(linkSource.includes("createDocumentDraft(eventId"), true, "must use canonical Docs Hub draft creation");
  assert.equal(linkSource.includes("finalizeDocumentUpload("), true, "must use canonical Docs Hub version creation");
  assert.equal(linkSource.includes('linkType: "SPEAKER", linkedId: speakerId'), true);
  assert.equal(linkSource.includes("submitForReview: true"), true);
  assert.equal(linkSource.includes("already linked"), true, "must reject double-linking");
  assert.equal(linkSource.includes("logSpeakerActivity("), true, "linking must be audited");
  // No direct prisma document/documentVersion writes.
  assert.equal(linkSource.includes("documentVersion.create"), false);
  assert.equal(linkSource.includes("document.create"), false);
});

test("documents service resolves SPEAKER links scoped to the event", () => {
  assert.equal(documentsServiceSource.includes('"BUDGET_ITEM", "DEADLINE", "MATRIX_SESSION", "EVENT", "SPEAKER"'), true);
  const resolveSource = sourceBetween(documentsServiceSource, "async function resolveLinkTargets", "function buildDocumentWhere");
  assert.equal(resolveSource.includes('link.linkType === "SPEAKER"'), true);
  assert.equal(resolveSource.includes("id: { in: speakerIds }, eventId"), true, "speaker link lookup must stay event-scoped");
});

test("portal document routes are token-gated and scoped to the resolved speaker", () => {
  for (const source of [portalListRouteSource, portalSubmitRouteSource]) {
    assert.equal(source.includes("resolveRequestUser"), false);
    assert.equal(source.includes("assertEventAccessForUser"), false);
  }

  const portalListSource = sourceBetween(serviceSource, "export async function listPortalSpeakerDocumentRequests", "export async function submitPortalSpeakerDocument");
  assert.equal(portalListSource.includes("await resolveSpeakerPortalToken(rawToken)"), true);
  assert.equal(portalListSource.includes("eventId: resolved.eventId, speakerId: resolved.speakerId"), true);

  const submitSource = serviceSource.slice(serviceSource.indexOf("export async function submitPortalSpeakerDocument"));
  assert.equal(submitSource.includes("await resolveSpeakerPortalToken(rawToken)"), true);
  assert.equal(submitSource.includes("id: requestId, eventId: resolved.eventId, speakerId: resolved.speakerId"), true);
  assert.equal(submitSource.includes("finalizePortalSpeakerFile(rawToken"), true, "submission must reuse the canonical portal file path");
  assert.equal(submitSource.includes('kind: "AGREEMENT"'), true);
});

test("portal payloads expose derived status but never Docs Hub internals", () => {
  const portalRecordSource = sourceBetween(serviceSource, "function toPortalRecord", "function requireText");
  assert.equal(portalRecordSource.includes("deriveSpeakerDocumentStatus(row)"), true);
  assert.equal(portalRecordSource.includes("documentId"), false, "Docs Hub ids are internal");
  assert.equal(portalRecordSource.includes("documentStatus"), false, "raw Docs Hub status is internal");
  assert.equal(portalRecordSource.includes("row.speakerFile?.reviewFeedback"), true, "speaker sees planner feedback");
});

test("portal documents UI submits via presign + submit endpoints and shows signature placeholder", () => {
  assert.equal(portalComponentSource.includes("/files/presign"), true);
  assert.equal(portalComponentSource.includes("/documents/${encodeURIComponent(requestId)}"), true);
  assert.equal(portalComponentSource.includes("Signature required"), true);
  assert.equal(portalComponentSource.includes("Upload Signed Copy"), true);
  assert.equal(portalComponentSource.includes("Event team feedback:"), true);
});

test("planner documents section assigns, downloads, and sends to Docs Hub", () => {
  assert.equal(plannerSectionSource.includes("Assign Document"), true);
  assert.equal(plannerSectionSource.includes("link-docs-hub"), true);
  assert.equal(plannerSectionSource.includes("Send to Docs Hub"), true);
  assert.equal(plannerSectionSource.includes("In Docs Hub"), true);
  assert.equal(plannerSectionSource.includes("/download"), true);
  assert.equal(plannerSectionSource.includes("requiresSignature"), true);
});
