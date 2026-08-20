import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const speakersServiceSource = readFileSync("src/server/services/speakers.ts", "utf8");
const speakersRouteSource = readFileSync("app/api/events/[eventId]/speakers/route.ts", "utf8");
const speakerDetailRouteSource = readFileSync("app/api/events/[eventId]/speakers/[speakerId]/route.ts", "utf8");
const speakerPresignRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/headshot/presign/route.ts",
  "utf8",
);
const matrixSpeakerAssignmentRouteSource = readFileSync(
  "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/speakers/[speakerId]/route.ts",
  "utf8",
);
const matrix2SessionSource = readFileSync("lib/matrix2-session.ts", "utf8");
const matrix2Source = readFileSync("lib/matrix2.ts", "utf8");
const publicIntakeRouteSource = readFileSync("app/api/public/speaker-intake/[token]/route.ts", "utf8");
const publicIntakePresignRouteSource = readFileSync(
  "app/api/public/speaker-intake/[token]/headshot/presign/route.ts",
  "utf8",
);
const profileSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-profile-section.tsx",
  "utf8",
);
const prismaSchemaSource = readFileSync("prisma/schema.prisma", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("speaker CRUD service enforces event scope on create, edit, and list", () => {
  const createSource = sourceBetween(speakersServiceSource, "export async function createSpeaker", "export async function getSpeaker");
  assert.equal(createSource.includes('await assertEventAccess(eventId, user, "write")'), true);
  assert.equal(createSource.includes("eventId,"), true);

  const updateSource = sourceBetween(speakersServiceSource, "export async function updateSpeaker", "export async function deleteSpeaker");
  assert.equal(updateSource.includes('await assertEventAccess(eventId, user, "write")'), true);
  assert.equal(updateSource.includes("await getSpeakerOrThrow(eventId, speakerId)"), true);

  const listSource = sourceBetween(speakersServiceSource, "export async function listSpeakers", "export async function createSpeaker");
  assert.equal(listSource.includes('await assertEventAccess(eventId, user, "read")'), true);
  assert.equal(listSource.includes("where: { eventId }"), true);
});

test("single-speaker GET route is authenticated, event-scoped, and returns 404 cross-event", () => {
  assert.equal(speakerDetailRouteSource.includes("async function getHandler"), true);
  assert.equal(
    speakerDetailRouteSource.includes('export const GET = withApiRequestLogging("GET /api/events/:eventId/speakers/:speakerId", getHandler)'),
    true,
  );

  const getHandlerSource = sourceBetween(speakerDetailRouteSource, "async function getHandler", "async function patchHandler");
  assert.equal(getHandlerSource.includes("resolveRequestUser(request)"), true);
  assert.equal(getHandlerSource.includes("getSpeaker(eventId, speakerId, authResult.user)"), true);

  const getSpeakerSource = sourceBetween(speakersServiceSource, "export async function getSpeaker", "export async function updateSpeaker");
  assert.equal(getSpeakerSource.includes('await assertEventAccess(eventId, user, "read")'), true);
  assert.equal(getSpeakerSource.includes("await getSpeakerOrThrow(eventId, speakerId)"), true);

  const getOrThrowSource = sourceBetween(speakersServiceSource, "async function getSpeakerOrThrow", "function toSpeakerPayload");
  assert.equal(getOrThrowSource.includes("id: speakerId,"), true);
  assert.equal(getOrThrowSource.includes("eventId,"), true);
  assert.equal(getOrThrowSource.includes('new SpeakerServiceError("Speaker not found", 404)'), true);

  // PATCH/DELETE behavior preserved alongside the new GET
  assert.equal(speakerDetailRouteSource.includes("export const PATCH"), true);
  assert.equal(speakerDetailRouteSource.includes("export const DELETE"), true);
});

test("admin headshot presign requires auth, write access, and event-scoped speaker", () => {
  assert.equal(speakerPresignRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(speakerPresignRouteSource.includes("createAdminSpeakerHeadshotPresign(eventId, speakerId, authResult.user"), true);
  assert.equal(speakerPresignRouteSource.includes("export const POST"), true);
  assert.equal(speakerPresignRouteSource.includes("export const GET"), false);

  const presignServiceSource = sourceBetween(
    speakersServiceSource,
    "export async function createAdminSpeakerHeadshotPresign",
    "validateSpeakerHeadshotUpload(contentType",
  );
  assert.equal(presignServiceSource.includes('await assertEventAccess(eventId, user, "write")'), true);
  assert.equal(presignServiceSource.includes("await getSpeakerOrThrow(eventId, speakerId)"), true);
});

test("admin headshot presign validates image uploads and reuses canonical storage helper", () => {
  const presignServiceSource = sourceBetween(
    speakersServiceSource,
    "export async function createAdminSpeakerHeadshotPresign",
    "asSpeakerServiceError(error, \"Failed to create headshot upload\")",
  );
  assert.equal(presignServiceSource.includes("validateSpeakerHeadshotUpload(contentType, input.fileSizeBytes)"), true);
  assert.equal(presignServiceSource.includes("createSpeakerHeadshotPresignedUpload({"), true);
  assert.equal(
    speakersServiceSource.includes('from "@/src/server/storage/speakers"'),
    true,
  );
});

test("full profile page headshot upload flow presigns, uploads, then persists via PATCH before reporting success", () => {
  const uploadSource = sourceBetween(
    profileSectionSource,
    "async function handleHeadshotSelected",
    "return (",
  );
  assert.equal(uploadSource.includes("/headshot/presign"), true);
  assert.equal(uploadSource.includes('method: "PUT"'), true);
  assert.equal(uploadSource.includes('method: "PATCH"'), true);

  const patchIndex = uploadSource.indexOf('method: "PATCH"');
  const noticeIndex = uploadSource.indexOf("setNotice(\"Headshot uploaded.\")");
  assert.equal(patchIndex !== -1 && noticeIndex !== -1 && patchIndex < noticeIndex, true, "success notice must come after server PATCH");

  assert.equal(profileSectionSource.includes('accept="image/*"'), true);
  assert.equal(profileSectionSource.includes("isUploadingHeadshot"), true);
  assert.equal(profileSectionSource.includes("Upload Headshot"), true);
});

test("session speaker assignment is canonical, event-scoped, and cross-event blocked", () => {
  assert.equal(matrixSpeakerAssignmentRouteSource.includes('await assertEventAccessForUser(eventId, authResult.user, "write")'), true);
  assert.equal(
    matrixSpeakerAssignmentRouteSource.includes(
      "addMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId, authResult.user.id)",
    ),
    true,
  );
  assert.equal(
    matrixSpeakerAssignmentRouteSource.includes(
      "removeMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId, authResult.user.id)",
    ),
    true,
  );

  const addSource = sourceBetween(
    matrix2SessionSource,
    "export async function addMatrix2SessionSpeakerAssignment",
    "ON CONFLICT",
  );
  assert.equal(addSource.includes("id: sessionId,"), true);
  assert.equal(addSource.includes("id: speakerId,"), true);
  assert.equal((addSource.match(/eventId,/g) ?? []).length >= 2, true, "both session and speaker lookups must filter by eventId");
  assert.equal(addSource.includes('new Matrix2Error("Session not found", 404)'), true);
  assert.equal(addSource.includes('new Matrix2Error("Speaker not found for this event", 404)'), true);

  const removeSource = sourceBetween(
    matrix2SessionSource,
    "export async function removeMatrix2SessionSpeakerAssignment",
    "export async function addMatrix2SessionSpeakerAssignment",
  );
  assert.equal(removeSource.includes('new Matrix2Error("Speaker not found for this event", 404)'), true);
  assert.equal(removeSource.includes('DELETE FROM "SessionSpeakerAssignment"'), true);
});

test("editing a speaker profile cannot mutate session assignments", () => {
  const updateSource = sourceBetween(speakersServiceSource, "export async function updateSpeaker", "export async function deleteSpeaker");
  assert.equal(updateSource.includes("SessionSpeakerAssignment"), false);
  assert.equal(updateSource.includes("sessionAssignments"), false);
  assert.equal(updateSource.includes("speaker.update"), true);
});

test("public intake flow remains token-verified and unchanged in shape", () => {
  assert.equal(publicIntakeRouteSource.includes("verifySpeakerIntakeToken(token)"), true);
  assert.equal(publicIntakeRouteSource.includes("submitSpeakerPublicIntake(payload.eventId, payload.speakerId, body)"), true);
  assert.equal(publicIntakePresignRouteSource.includes("verifySpeakerIntakeToken(token)"), true);
  assert.equal(publicIntakePresignRouteSource.includes("getSpeakerForPublicIntake(payload.eventId, payload.speakerId)"), true);
});

test("Matrix reads speakers via canonical join and stores no duplicate profile columns", () => {
  assert.equal(matrix2Source.includes('JOIN "Speaker" sp ON sp."id" = s."speakerId"'), true);
  assert.equal(matrix2Source.includes('FROM "SessionSpeakerAssignment" s'), true);

  const matrixRowModelSource = sourceBetween(prismaSchemaSource, "model MatrixRow {", "model SessionSpeakerAssignment {");
  assert.equal(matrixRowModelSource.includes("speakerName"), false);
  assert.equal(matrixRowModelSource.includes("speakerBio"), false);
  assert.equal(matrixRowModelSource.includes("speakerEmail"), false);
  assert.equal(matrixRowModelSource.includes("headshot"), false);
  assert.equal(matrixRowModelSource.includes("sessionSpeakerAssignments    SessionSpeakerAssignment[]"), true);
  assert.equal(prismaSchemaSource.includes("model SessionSpeaker {"), false);

  // Matrix session save resolves speakers against the canonical directory and refuses to invent them
  assert.equal(matrix2SessionSource.includes('new Matrix2Error("Speakers must reference an existing speaker record", 400)'), true);
  assert.equal(matrix2SessionSource.includes("was not found in the speaker directory"), true);
});

test("speakers list route requires auth and uses event-scoped service", () => {
  assert.equal(speakersRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(speakersRouteSource.includes("listSpeakers(eventId, authResult.user)"), true);
  assert.equal(speakersRouteSource.includes("createSpeaker(eventId, authResult.user"), true);
});
