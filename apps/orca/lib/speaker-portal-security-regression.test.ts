import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const portalServiceSource = readFileSync("src/server/services/speaker-portal.ts", "utf8");
const tokenServiceSource = readFileSync("src/server/services/speaker-portal-tokens.ts", "utf8");
const reviewServiceSource = readFileSync("src/server/services/speaker-submissions.ts", "utf8");

function collectRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...collectRouteFiles(fullPath));
    } else if (entry === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

const publicPortalRoutes = collectRouteFiles("app/api/public/speaker-portal");
const adminSpeakerRoutes = [
  ...collectRouteFiles("app/api/events/[eventId]").filter((routePath) => routePath.includes("speaker")),
];

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("every public portal route is gated by the persistent token service only", () => {
  assert.equal(publicPortalRoutes.length >= 3, true, "expected portal view, submission, and presign routes");

  for (const routePath of publicPortalRoutes) {
    const source = readFileSync(routePath, "utf8");
    const usesTokenGate =
      source.includes("resolveSpeakerPortalToken") ||
      source.includes("getSpeakerPortalView") ||
      source.includes("submitSpeakerPortalProfile") ||
      // Portal file-service functions resolve the token internally
      // (pinned by speaker-files-regression tests)
      source.includes("createPortalSpeakerFilePresign") ||
      source.includes("finalizePortalSpeakerFile") ||
      source.includes("listPortalSpeakerFiles") ||
      // Portal document-service functions resolve the token internally
      // (pinned by speaker-documents-regression tests)
      source.includes("listPortalSpeakerDocumentRequests") ||
      source.includes("submitPortalSpeakerDocument") ||
      // Portal message-service functions resolve the token internally
      // (pinned by speaker-comms-regression tests)
      source.includes("listPortalSpeakerMessages") ||
      source.includes("createPortalSpeakerMessage");
    assert.equal(usesTokenGate, true, `${routePath} must resolve the portal token`);
    assert.equal(source.includes("resolveRequestUser"), false, `${routePath} must not use session auth`);
    assert.equal(source.includes("assertEventAccessForUser"), false, `${routePath} must not bypass token scope`);
    // Portal routes can never reach review/approval or assignment services
    assert.equal(source.includes("speaker-submissions"), false, `${routePath} must not import the review service`);
    assert.equal(source.includes("approveSpeakerSubmission"), false, `${routePath} must not approve submissions`);
    assert.equal(source.includes("matrix2-session"), false, `${routePath} must not touch assignments`);
  }
});

test("every admin speaker route authenticates the request user", () => {
  assert.equal(adminSpeakerRoutes.length >= 16, true, "expected the full admin speaker route set");

  for (const routePath of adminSpeakerRoutes) {
    const source = readFileSync(routePath, "utf8");
    assert.equal(source.includes("resolveRequestUser(request)"), true, `${routePath} must authenticate`);
    assert.equal(source.includes("resolveSpeakerPortalToken"), false, `${routePath} must not accept portal tokens`);
  }
});

test("admin speaker routes pass the resolved planner identity into server-side authorization", () => {
  for (const routePath of adminSpeakerRoutes) {
    const source = readFileSync(routePath, "utf8");
    const usesResolvedUser =
      source.includes("authResult.user") ||
      source.includes("assertEventAccessForUser(eventId, authResult.user");
    assert.equal(usesResolvedUser, true, `${routePath} must authorize with the resolved planner user`);
    assert.equal(source.includes("request.nextUrl.searchParams.get(\"eventId\")"), false, `${routePath} must not trust eventId query params`);
    assert.equal(source.includes("body.eventId"), false, `${routePath} must not trust eventId request bodies for scope`);
  }
});

test("public portal routes return safe token failures without leaking token internals", () => {
  for (const routePath of publicPortalRoutes) {
    const source = readFileSync(routePath, "utf8");
    assert.equal(source.includes("SpeakerPortalTokenError"), true, `${routePath} must handle token failures`);
    assert.equal(source.includes("return NextResponse.json({ error: error.message }, { status: error.status })"), true);
    assert.equal(source.includes("tokenHash"), false, `${routePath} must not expose token hashes`);
    assert.equal(source.includes("rawToken"), false, `${routePath} must not expose raw token internals`);
  }
});

test("portal service layer cannot approve, list speakers, or mutate assignments", () => {
  for (const source of [portalServiceSource, tokenServiceSource]) {
    assert.equal(source.includes("approveSpeakerSubmission"), false);
    assert.equal(source.includes('"APPROVED"'), false);
    assert.equal(source.includes("speaker.findMany"), false);
    assert.equal(source.includes("sessionSpeakerAssignment.create"), false);
    assert.equal(source.includes("sessionSpeakerAssignment.delete"), false);
    assert.equal(source.includes('INSERT INTO "SessionSpeakerAssignment"'), false);
    assert.equal(source.includes('DELETE FROM "SessionSpeakerAssignment"'), false);
  }
});

test("token queries are always scoped by hash or speaker+event pair, never raw token", () => {
  // Every speakerIntakeToken query in the token service filters by tokenHash, id, or speakerId+eventId
  const queryBlocks = tokenServiceSource.split("speakerIntakeToken.").slice(1);
  assert.equal(queryBlocks.length >= 4, true);
  for (const block of queryBlocks) {
    const head = block.slice(0, 300);
    const scoped =
      head.includes("tokenHash") ||
      head.includes("id: tokenId") ||
      (head.includes("speakerId") && head.includes("eventId"));
    assert.equal(scoped, true, `unscoped token query: ${head.slice(0, 120)}`);
  }
  // Raw token must never reach a persistence call — only the hash is stored
  const createBlock = tokenServiceSource.slice(
    tokenServiceSource.indexOf("tx.speakerIntakeToken.create"),
    tokenServiceSource.indexOf("tx.speaker.update"),
  );
  assert.equal(createBlock.includes("rawToken"), false, "raw token must never be persisted");
  assert.equal(createBlock.includes("tokenHash"), true);
});

test("token resolution refuses speaker/event mismatch before granting portal scope", () => {
  const resolveSource = sourceBetween(
    tokenServiceSource,
    "export async function resolveSpeakerPortalToken",
    "export async function markSpeakerPortalTokenSubmitted",
  );
  assert.equal(resolveSource.includes("speaker: { select: { eventId: true } }"), true);
  assert.equal(resolveSource.includes("record.speaker.eventId !== record.eventId"), true);
  assert.equal(resolveSource.includes('new SpeakerPortalTokenError("Invalid portal link.", 401)'), true);
});

test("headshot presign for the portal is locked to the token's own speaker and event", () => {
  const presignSource = readFileSync("app/api/public/speaker-portal/[token]/headshot/presign/route.ts", "utf8");
  assert.equal(presignSource.includes("eventId: resolved.eventId"), true);
  assert.equal(presignSource.includes("speakerId: resolved.speakerId"), true);
  assert.equal(presignSource.includes("body.eventId"), false, "client-provided eventId must be ignored");
  assert.equal(presignSource.includes("body.speakerId"), false, "client-provided speakerId must be ignored");
});

test("submission writes are scoped to the resolved token identity, not client input", () => {
  const submitSource = portalServiceSource.slice(
    portalServiceSource.indexOf("export async function submitSpeakerPortalProfile"),
  );
  assert.equal(submitSource.includes("speakerId: resolved.speakerId"), true);
  assert.equal(submitSource.includes("eventId: resolved.eventId"), true);
  assert.equal(submitSource.includes("tokenId: resolved.tokenId"), true);
  assert.equal(submitSource.includes("input.eventId"), false);
  assert.equal(submitSource.includes("input.speakerId"), false);
});

test("review service stamps the reviewer and cannot be reached without event write access", () => {
  const occurrences = reviewServiceSource.match(/assertEventAccessForUser\(eventId, user, "write"\)/g) ?? [];
  assert.equal(occurrences.length >= 2, true, "approve and reject must both require write access");
  assert.equal(reviewServiceSource.includes("reviewedByUserId: user.id"), true);
});
