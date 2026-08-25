import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const filesServiceSource = readFileSync("src/server/services/speaker-files.ts", "utf8");
const storageSource = readFileSync("src/server/storage/speakers.ts", "utf8");
const adminFilesRouteSource = readFileSync("app/api/events/[eventId]/speakers/[speakerId]/files/route.ts", "utf8");
const adminPresignRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/files/presign/route.ts",
  "utf8",
);
const downloadRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/files/[fileId]/download/route.ts",
  "utf8",
);
const portalFilesRouteSource = readFileSync("app/api/public/speaker-portal/[token]/files/route.ts", "utf8");
const portalPresignRouteSource = readFileSync(
  "app/api/public/speaker-portal/[token]/files/presign/route.ts",
  "utf8",
);
const prismaSchemaSource = readFileSync("prisma/schema.prisma", "utf8");
const filesSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-files-section.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("SpeakerFile model is normalized, event-scoped, and links to canonical Speaker", () => {
  const modelSource = sourceBetween(prismaSchemaSource, "model SpeakerFile {", "enum ");
  assert.match(modelSource, /\bspeakerId\s+String\s+@db\.Uuid\b/);
  assert.match(modelSource, /\beventId\s+String\s+@db\.Uuid\b/);
  assert.match(modelSource, /\bobjectKey\s+String\s+@unique\b/);
  assert.match(modelSource, /\bspeaker\s+Speaker\s+@relation\(fields: \[speakerId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(modelSource, /\bevent\s+Event\s+@relation\(fields: \[eventId\], references: \[id\], onDelete: Cascade\)/);
  assert.equal(modelSource.includes("onDelete: Cascade"), true);
  assert.equal(modelSource.includes("Json"), false, "file metadata must be normalized, not a JSON blob");
  assert.equal(prismaSchemaSource.includes("enum SpeakerFileKind"), true);
});

test("admin file operations require auth and event-scoped speaker checks", () => {
  for (const source of [adminFilesRouteSource, adminPresignRouteSource, downloadRouteSource]) {
    assert.equal(source.includes("resolveRequestUser(request)"), true);
  }

  const listSource = sourceBetween(filesServiceSource, "export async function listSpeakerFiles", "export async function createAdminSpeakerFilePresign");
  assert.equal(listSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(listSource.includes("await assertSpeakerInEvent(eventId, speakerId)"), true);

  const presignSource = sourceBetween(filesServiceSource, "export async function createAdminSpeakerFilePresign", "export async function finalizeAdminSpeakerFile");
  assert.equal(presignSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);

  const finalizeSource = sourceBetween(filesServiceSource, "export async function finalizeAdminSpeakerFile", "export async function getAdminSpeakerFileDownload");
  assert.equal(finalizeSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(finalizeSource.includes("uploadedByUserId: user.id"), true);
  assert.equal(finalizeSource.includes("uploadedViaPortal: false"), true);
});

test("admin download is scoped to file + speaker + event", () => {
  const downloadSource = sourceBetween(filesServiceSource, "export async function getAdminSpeakerFileDownload", "function assertObjectKeyScope");
  assert.equal(downloadSource.includes("id: fileId, eventId, speakerId"), true);
  assert.equal(downloadSource.includes('new SpeakerFileError("File not found", 404)'), true);
  assert.equal(downloadSource.includes("getSpeakerFileDownloadUrl(file.objectKey)"), true);
  assert.equal(downloadSource.includes("orderBy"), false, "download must not fall back to latest file version");
  assert.equal(downloadSource.includes("take: 1"), false, "download must require the requested file id");
});

test("portal file routes are token-gated and write only to the token's speaker", () => {
  for (const source of [portalFilesRouteSource, portalPresignRouteSource]) {
    assert.equal(source.includes("resolveRequestUser"), false);
    assert.equal(source.includes("assertEventAccessForUser"), false);
  }

  const portalFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizePortalSpeakerFile", "export async function listPortalSpeakerFiles");
  assert.equal(portalFinalizeSource.includes("await resolveSpeakerPortalToken(rawToken)"), true);
  assert.equal(portalFinalizeSource.includes("eventId: resolved.eventId"), true);
  assert.equal(portalFinalizeSource.includes("speakerId: resolved.speakerId"), true);
  assert.equal(portalFinalizeSource.includes("uploadedViaPortal: true"), true);
  assert.equal(portalFinalizeSource.includes("input.eventId"), false);
  assert.equal(portalFinalizeSource.includes("input.speakerId"), false);

  const portalListSource = filesServiceSource.slice(filesServiceSource.indexOf("export async function listPortalSpeakerFiles"));
  assert.equal(portalListSource.includes("eventId: resolved.eventId, speakerId: resolved.speakerId"), true);
});

test("speaker file API payloads do not expose internal storage or actor metadata", () => {
  const fileSelectSource = sourceBetween(filesServiceSource, "const fileSelect = {", "} satisfies Prisma.SpeakerFileSelect");
  assert.equal(fileSelectSource.includes("objectKey: true"), false, "objectKey is internal storage metadata");
  assert.equal(fileSelectSource.includes("uploadedByUserId: true"), false, "actor user ids are internal metadata");
  assert.equal(fileSelectSource.includes("speakerId: true"), true);
  assert.equal(fileSelectSource.includes("eventId: true"), true);

  const adminDownloadSource = sourceBetween(filesServiceSource, "export async function getAdminSpeakerFileDownload", "function assertObjectKeyScope");
  assert.equal(adminDownloadSource.includes("select: { objectKey: true, filename: true }"), true);
});

test("admin and portal presign/finalize paths reject wrong event, speaker, and file scope", () => {
  const adminPresignSource = sourceBetween(filesServiceSource, "export async function createAdminSpeakerFilePresign", "export async function finalizeAdminSpeakerFile");
  const adminFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizeAdminSpeakerFile", "export async function getAdminSpeakerFileDownload");
  const portalPresignSource = sourceBetween(filesServiceSource, "export async function createPortalSpeakerFilePresign", "export async function finalizePortalSpeakerFile");
  const portalFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizePortalSpeakerFile", "export async function listPortalSpeakerFiles");

  assert.equal(adminPresignSource.includes("await assertSpeakerInEvent(eventId, speakerId)"), true);
  assert.equal(adminFinalizeSource.includes("await assertSpeakerInEvent(eventId, speakerId)"), true);
  assert.equal(adminFinalizeSource.includes("assertObjectKeyScope(objectKey, eventId, speakerId)"), true);
  assert.equal(portalPresignSource.includes("eventId: resolved.eventId"), true);
  assert.equal(portalPresignSource.includes("speakerId: resolved.speakerId"), true);
  assert.equal(portalFinalizeSource.includes("assertObjectKeyScope(objectKey, resolved.eventId, resolved.speakerId)"), true);
});

test("object keys are validated against the speaker's own storage prefix", () => {
  const scopeSource = sourceBetween(filesServiceSource, "function assertObjectKeyScope", "export async function createPortalSpeakerFilePresign");
  assert.equal(scopeSource.includes("events/${eventId}/speakers/${speakerId}/files/"), true);
  assert.equal(scopeSource.includes('includes("..")'), true);
  // Both finalize paths enforce it
  assert.equal((filesServiceSource.match(/assertObjectKeyScope\(/g) ?? []).length >= 3, true);
});

test("file uploads validate type and size against the storage allowlist", () => {
  assert.equal(storageSource.includes("validateSpeakerFileUpload"), true);
  assert.equal(storageSource.includes("application/pdf"), true);
  assert.equal(storageSource.includes("50 * 1024 * 1024"), true);
  assert.equal(filesServiceSource.includes("validateSpeakerFileUpload(contentType, fileSizeBytes)"), true);
});

test("full profile files section lists, uploads, and downloads through the API", () => {
  assert.equal(filesSectionSource.includes("Slides, agreements, and uploads"), true);
  assert.equal(filesSectionSource.includes("/files/presign"), true);
  assert.equal(filesSectionSource.includes("/download"), true);
  assert.equal(filesSectionSource.includes("SPEAKER_FILE_KINDS"), true);
  assert.equal(filesSectionSource.includes("No files uploaded"), true);
});

// --- Prompt 15: deck versioning + planner review ---

const reviewRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/files/[fileId]/review/route.ts",
  "utf8",
);
const portalFilesComponentSource = readFileSync(
  "app/speaker-portal/[token]/_components/speaker-portal-files.tsx",
  "utf8",
);
const deckMigrationSource = readFileSync(
  "test-fixtures/legacy-orca-migrations/20260611100000_add_speaker_deck_versioning/migration.sql",
  "utf8",
);

test("SpeakerFile schema supports immutable deck versioning against canonical Matrix sessions", () => {
  const modelSource = sourceBetween(prismaSchemaSource, "model SpeakerFile {", "enum ");
  assert.match(modelSource, /\bversion\s+Int\s+@default\(1\)/);
  assert.match(modelSource, /\breviewStatus\s+SpeakerFileReviewStatus\s+@default\(RECEIVED\)/);
  assert.match(modelSource, /\bsessionId\s+String\?\s+@db\.Uuid\b/);
  // Session link must point at MatrixRow (Matrix stays source of truth); no copied session fields.
  assert.equal(modelSource.includes('references: [id], onDelete: SetNull'), true);
  assert.equal(modelSource.includes("MatrixRow?"), true);
  assert.equal(modelSource.includes("sessionName"), false, "must not copy canonical session fields onto files");
  assert.equal(prismaSchemaSource.includes("enum SpeakerFileReviewStatus"), true);
  assert.equal(deckMigrationSource.includes('ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1'), true);
  assert.equal(deckMigrationSource.includes("DROP"), false, "deck versioning migration must stay additive");
});

test("every upload creates a new version and never mutates or deletes prior versions", () => {
  const versionSource = sourceBetween(filesServiceSource, "async function nextFileVersion", "export async function listSpeakerFiles");
  assert.equal(versionSource.includes("_max: { version: true }"), true);
  assert.equal(versionSource.includes("(latest._max.version ?? 0) + 1"), true);

  const adminFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizeAdminSpeakerFile", "export async function getAdminSpeakerFileDownload");
  const portalFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizePortalSpeakerFile", "export async function listPortalSpeakerFiles");
  for (const source of [adminFinalizeSource, portalFinalizeSource]) {
    assert.equal(source.includes("$transaction"), true, "version assignment must be transactional");
    assert.equal(source.includes("nextFileVersion(tx"), true);
    assert.equal(source.includes(".create("), true, "uploads must insert new rows, not update existing ones");
  }

  assert.equal(filesServiceSource.includes("speakerFile.delete"), false, "old deck versions must never be deleted");
  assert.equal(filesServiceSource.includes("speakerFile.upsert"), false, "old deck versions must never be overwritten");
});

test("session attachment is validated against event scope and speaker assignment", () => {
  const sessionScopeSource = sourceBetween(filesServiceSource, "async function assertSessionInEvent", "async function nextFileVersion");
  assert.equal(sessionScopeSource.includes("id: sessionId, eventId"), true);
  assert.equal(sessionScopeSource.includes("sessionId_speakerId: { sessionId, speakerId }"), true);

  const portalFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizePortalSpeakerFile", "export async function listPortalSpeakerFiles");
  assert.equal(portalFinalizeSource.includes("await assertSessionInEvent(resolved.eventId, normalized.sessionId)"), true);
  assert.equal(
    portalFinalizeSource.includes("await assertSpeakerAssignedToSession(resolved.speakerId, normalized.sessionId)"),
    true,
    "portal uploads may only attach to the speaker's own assigned sessions",
  );

  const adminFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizeAdminSpeakerFile", "export async function getAdminSpeakerFileDownload");
  assert.equal(adminFinalizeSource.includes("await assertSessionInEvent(eventId, normalized.sessionId)"), true);

  // Routes must forward sessionId so the validated service path receives it.
  assert.equal(portalFilesRouteSource.includes("sessionId: body.sessionId"), true);
  assert.equal(adminFilesRouteSource.includes("sessionId: body.sessionId"), true);
});

test("planner review is auth-gated, event/speaker scoped, status-constrained, and audited", () => {
  assert.equal(reviewRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(reviewRouteSource.includes("reviewSpeakerFile("), true);

  const reviewSource = sourceBetween(filesServiceSource, "export async function reviewSpeakerFile", "function assertObjectKeyScope");
  assert.equal(reviewSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(reviewSource.includes("id: fileId, eventId, speakerId"), true);
  assert.equal(reviewSource.includes("reviewedByUserId: user.id"), true);
  assert.equal(reviewSource.includes("logSpeakerActivity("), true, "review actions must be audited");
  assert.equal(filesServiceSource.includes('["RECEIVED", "NEEDS_CHANGES", "APPROVED", "FINAL"]'), true);

  // Review must not rewrite deck content/version metadata.
  assert.equal(reviewSource.includes("objectKey"), false);
  assert.equal(reviewSource.includes("version:"), false);
});

test("admin uploads are audited via speaker activity log", () => {
  const adminFinalizeSource = sourceBetween(filesServiceSource, "export async function finalizeAdminSpeakerFile", "export async function getAdminSpeakerFileDownload");
  assert.equal(adminFinalizeSource.includes("logSpeakerActivity("), true);
});

test("review metadata is exposed to clients without leaking reviewer identity", () => {
  const fileSelectSource = sourceBetween(filesServiceSource, "const fileSelect = {", "} satisfies Prisma.SpeakerFileSelect");
  assert.equal(fileSelectSource.includes("version: true"), true);
  assert.equal(fileSelectSource.includes("reviewStatus: true"), true);
  assert.equal(fileSelectSource.includes("reviewFeedback: true"), true);
  assert.equal(fileSelectSource.includes("sessionId: true"), true);
  assert.equal(fileSelectSource.includes("reviewedByUserId: true"), false, "reviewer user id is internal metadata");
});

test("portal files UI uploads new versions and shows planner feedback/status", () => {
  assert.equal(portalFilesComponentSource.includes("/files/presign"), true);
  assert.equal(portalFilesComponentSource.includes("uploadSessionId ? { sessionId: uploadSessionId } : {}"), true);
  assert.equal(portalFilesComponentSource.includes("REVIEW_STATUS_LABELS"), true);
  assert.equal(portalFilesComponentSource.includes("reviewFeedback"), true);
  assert.equal(portalFilesComponentSource.includes("v{file.version}"), true);
});

test("full profile review panel updates status through the review API and labels feedback as speaker-visible", () => {
  assert.equal(filesSectionSource.includes("/review"), true);
  assert.equal(filesSectionSource.includes("SPEAKER_FILE_REVIEW_STATUSES"), true);
  assert.equal(filesSectionSource.includes("reviewStatus: reviewStatusDraft"), true);
  assert.equal(filesSectionSource.includes("Feedback visible to the speaker"), true);
  assert.equal(filesSectionSource.includes("v{file.version}"), true);
});
