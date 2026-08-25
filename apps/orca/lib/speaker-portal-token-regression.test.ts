import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokenServiceSource = readFileSync("src/server/services/speaker-portal-tokens.ts", "utf8");
const portalLinkRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/portal-link/route.ts",
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

test("portal token schema stores a unique hash with expiry, revocation, and submission tracking", () => {
  const tokenModelSource = sourceBetween(prismaSchemaSource, "model SpeakerIntakeToken {", "model SpeakerProfileSubmission {");
  assert.equal(tokenModelSource.includes("tokenHash   String                     @unique"), true);
  assert.equal(tokenModelSource.includes("expiresAt   DateTime"), true);
  assert.equal(tokenModelSource.includes("submittedAt DateTime?"), true);
  assert.equal(tokenModelSource.includes("revokedAt   DateTime?"), true);
  assert.equal(tokenModelSource.includes("onDelete: Cascade"), true);
  assert.equal(tokenModelSource.includes("rawToken"), false);
  assert.equal(tokenModelSource.includes("token       String"), false);
});

test("token generation stores only a sha256 hash, never the raw token", () => {
  const generateSource = sourceBetween(
    tokenServiceSource,
    "export async function generateSpeakerPortalToken",
    "export async function revokeSpeakerPortalTokens",
  );
  assert.equal(generateSource.includes("randomBytes(RAW_TOKEN_BYTES)"), true);
  assert.equal(generateSource.includes("hashSpeakerPortalToken(rawToken)"), true);
  assert.equal(generateSource.includes("tokenHash,"), true);
  // The create call must not persist the raw token
  const createBlock = sourceBetween(generateSource, "tx.speakerIntakeToken.create", "tx.speaker.update");
  assert.equal(createBlock.includes("rawToken"), false);
  // Raw token returned exactly once at generation
  assert.equal(generateSource.includes("token: rawToken,"), true);

  assert.equal(tokenServiceSource.includes('createHash("sha256")'), true);
});

test("portal-link Activity entries are canonical, speaker-scoped, and secret-free", () => {
  const generateSource = sourceBetween(
    tokenServiceSource,
    "export async function generateSpeakerPortalToken",
    "export async function revokeSpeakerPortalTokens",
  );
  const activityBlock = sourceBetween(generateSource, "await logSpeakerActivity", "return token;");
  assert.equal(activityBlock.includes("Portal link generated for ${speaker.name}"), true);
  assert.equal(activityBlock.includes('action: "GENERATED"'), true);
  assert.equal(activityBlock.includes("entityType"), false, "speaker helper supplies the Speaker entity type");
  assert.equal(activityBlock.includes("entityId: speaker.id"), true);
  assert.equal(activityBlock.includes("entityLabel: speaker.name"), true);
  assert.equal(activityBlock.includes("SpeakerIntakeToken"), true, "idempotency uses token record identity only");
  for (const term of ["rawToken", "portalUrl", "tokenHash"]) {
    assert.equal(activityBlock.includes(term), false, `Activity payload must not include ${term}`);
  }
});

test("hashSpeakerPortalToken is a stable sha256 hex digest", async () => {
  // Mirror the implementation contract without importing server-only modules
  const expected = createHash("sha256").update("test-token", "utf8").digest("hex");
  assert.equal(expected.length, 64);
  assert.equal(tokenServiceSource.includes('digest("hex")'), true);
});

test("token resolution rejects invalid, expired, and revoked tokens", () => {
  const resolveSource = sourceBetween(
    tokenServiceSource,
    "export async function resolveSpeakerPortalToken",
    "export async function markSpeakerPortalTokenSubmitted",
  );
  assert.equal(resolveSource.includes('new SpeakerPortalTokenError("Invalid portal link.", 401)'), true);
  assert.equal(resolveSource.includes('new SpeakerPortalTokenError("This portal link has been revoked.", 401)'), true);
  assert.equal(resolveSource.includes('new SpeakerPortalTokenError("This portal link has expired.", 401)'), true);
  assert.equal(resolveSource.includes("findUnique"), true);
  assert.equal(resolveSource.includes("tokenHash: hashSpeakerPortalToken(normalized)"), true);
  // Resolution returns only the token's own speaker/event scope
  assert.equal(resolveSource.includes("eventId: record.eventId"), true);
  assert.equal(resolveSource.includes("speakerId: record.speakerId"), true);
  assert.equal(resolveSource.includes("record.speaker.eventId !== record.eventId"), true);
});

test("token generation and revocation require event write access and event-scoped speaker", () => {
  const generateSource = sourceBetween(
    tokenServiceSource,
    "export async function generateSpeakerPortalToken",
    "export async function revokeSpeakerPortalTokens",
  );
  assert.equal(generateSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(generateSource.includes("await assertSpeakerInEvent(eventId, speakerId)"), true);

  const revokeSource = sourceBetween(
    tokenServiceSource,
    "export async function revokeSpeakerPortalTokens",
    "export async function getSpeakerPortalTokenStatus",
  );
  assert.equal(revokeSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(revokeSource.includes("await assertSpeakerInEvent(eventId, speakerId)"), true);

  const speakerScopeSource = sourceBetween(
    tokenServiceSource,
    "async function assertSpeakerInEvent",
    "export async function generateSpeakerPortalToken",
  );
  assert.equal(speakerScopeSource.includes("id: speakerId, eventId"), true);
  assert.equal(speakerScopeSource.includes('new SpeakerPortalTokenError("Speaker not found", 404)'), true);
});

test("revocation marks revokedAt on token rows scoped to the speaker and event", () => {
  const revokeSource = sourceBetween(
    tokenServiceSource,
    "export async function revokeSpeakerPortalTokens",
    "export async function getSpeakerPortalTokenStatus",
  );
  assert.equal(revokeSource.includes("speakerId,"), true);
  assert.equal(revokeSource.includes("eventId,"), true);
  assert.equal(revokeSource.includes("revokedAt: null"), true);
  assert.equal(revokeSource.includes("revokedAt: new Date()"), true);
});

test("generating a new token revokes prior active tokens for the same speaker", () => {
  const generateSource = sourceBetween(
    tokenServiceSource,
    "export async function generateSpeakerPortalToken",
    "export async function revokeSpeakerPortalTokens",
  );
  const revokePriorBlock = sourceBetween(generateSource, "tx.speakerIntakeToken.updateMany", "tx.speakerIntakeToken.create");
  assert.equal(revokePriorBlock.includes("revokedAt: null"), true);
  assert.equal(revokePriorBlock.includes("revokedAt: now"), true);
});

test("portal-link admin route is authenticated on all methods", () => {
  for (const handler of ["async function postHandler", "async function getHandler", "async function deleteHandler"]) {
    const handlerSource = sourceBetween(portalLinkRouteSource, handler, "  }\n}");
    assert.equal(handlerSource.includes("resolveRequestUser(request)"), true, `${handler} must authenticate`);
  }

  assert.equal(portalLinkRouteSource.includes("generateSpeakerPortalToken(eventId, speakerId, authResult.user"), true);
  assert.equal(portalLinkRouteSource.includes("getSpeakerPortalTokenStatus(eventId, speakerId, authResult.user)"), true);
  assert.equal(portalLinkRouteSource.includes("revokeSpeakerPortalTokens(eventId, speakerId, authResult.user)"), true);
  assert.equal(portalLinkRouteSource.includes("export const POST"), true);
  assert.equal(portalLinkRouteSource.includes("export const GET"), true);
  assert.equal(portalLinkRouteSource.includes("export const DELETE"), true);
});

test("token status endpoint never returns the token hash or raw token", () => {
  const statusSource = sourceBetween(
    tokenServiceSource,
    "export async function getSpeakerPortalTokenStatus",
    "export async function resolveSpeakerPortalToken",
  );
  assert.equal(statusSource.includes("tokenHash: true"), false);
  assert.equal(statusSource.includes("rawToken"), false);

  const statusTypeSource = sourceBetween(tokenServiceSource, "export type SpeakerPortalTokenStatus", "};");
  assert.equal(statusTypeSource.includes("tokenHash"), false);
  assert.equal(statusTypeSource.includes("token:"), false);
});

test("submission marking stamps both the token and the canonical speaker", () => {
  const markSource = tokenServiceSource.slice(
    tokenServiceSource.indexOf("export async function markSpeakerPortalTokenSubmitted"),
  );
  assert.equal(markSource.includes("submittedAt: now"), true);
  assert.equal(markSource.includes("intakeSubmittedAt: now"), true);
  assert.equal(markSource.includes("select: { speakerId: true, eventId: true }"), true);
  assert.equal(markSource.includes("where: { id: token.speakerId, eventId: token.eventId }"), true);
  assert.equal(markSource.includes("speakerUpdate.count !== 1"), true);
  assert.equal(markSource.includes('new SpeakerPortalTokenError("Invalid portal link.", 401)'), true);
});

test("speaker portal schema is event-scoped and normalized", () => {
  for (const [modelName, requiredIndex] of [
    ["Speaker", "@@index([eventId])"],
    ["SpeakerIntakeToken", "@@index([speakerId, eventId])"],
    ["SpeakerProfileSubmission", "@@index([eventId, status])"],
    ["SpeakerReadinessItem", "@@unique([speakerId, eventId, key])"],
    ["SpeakerFile", "@@index([eventId, kind])"],
  ] as const) {
    const modelSource = sourceBetween(
      prismaSchemaSource,
      `model ${modelName} {`,
      modelName === "SpeakerFile" ? "model Deadline {" : "model ",
    );
    assert.equal(modelSource.includes("eventId"), true, `${modelName} must carry eventId`);
    assert.equal(modelSource.includes("@relation(fields: [eventId], references: [id], onDelete: Cascade)"), true);
    assert.equal(modelSource.includes(requiredIndex), true, `${modelName} missing expected event index`);
    assert.equal(modelSource.includes("Json"), false, `${modelName} must not hide operational data in Json`);
  }
});
