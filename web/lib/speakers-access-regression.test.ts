import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const speakersServiceSource = readFileSync("src/server/services/speakers.ts", "utf8");
const speakersRouteSource = readFileSync("app/api/events/[eventId]/speakers/route.ts", "utf8");
const speakerDetailRouteSource = readFileSync("app/api/events/[eventId]/speakers/[speakerId]/route.ts", "utf8");
const speakerImportRouteSource = readFileSync("app/api/events/[eventId]/speakers/import/route.ts", "utf8");
const speakerIntakeRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/request-profile-update/route.ts",
  "utf8",
);
const matrixSpeakerAssignmentRouteSource = readFileSync(
  "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/speakers/[speakerId]/route.ts",
  "utf8",
);
const sessionDetailWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const eventAccessSource = readFileSync("lib/event-access.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Speakers panel loads the event speaker directory with the route eventId", () => {
  const pickerSource = sourceBetween(
    sessionDetailWorkspaceSource,
    "function SpeakerPicker",
    "function FnbSourceMenusTable",
  );

  assert.equal(pickerSource.includes("eventId: string;"), true);
  assert.equal(pickerSource.includes("fetch(`/api/events/${eventId}/speakers`)"), true);
  assert.equal(pickerSource.includes("Search speaker directory"), true);
});

test("speaker directory service uses canonical event access for read and write", () => {
  assert.equal(speakersServiceSource.includes('import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";'), true);
  assert.equal(speakersServiceSource.includes("await assertEventAccessForUser(eventId, user, accessType);"), true);
  assert.equal(speakersServiceSource.includes("getPrisma().eventMember.findUnique"), false);
  assert.equal(speakersServiceSource.includes('new SpeakerServiceError(error.message, error.status, error.reason)'), true);

  const canonicalOwnerAdminSource = sourceBetween(
    eventAccessSource,
    "if (canListOrganizationEvents(user.role))",
    "if (!eventRole)",
  );
  assert.equal(eventAccessSource.includes('import { canListOrganizationEvents } from "@/lib/events";'), true);
  assert.equal(canonicalOwnerAdminSource.includes("allowedDecision(event.id, event.orgId, user, eventRole, true)"), true);
});

test("event members can load Speakers data while org members without EventMember receive controlled 403", () => {
  assert.equal(eventAccessSource.includes('"EVENT_MEMBERSHIP_REQUIRED"'), true);
  assert.equal(eventAccessSource.includes('throw new EventAccessError("Event membership required", 403'), true);
  assert.equal(speakersRouteSource.includes("const speakers = await listSpeakers(eventId, authResult.user);"), true);
  assert.equal(speakersRouteSource.includes("error.reason ? { reason: error.reason } : {}"), true);
  assert.equal(speakerDetailRouteSource.includes("error.reason ? { reason: error.reason } : {}"), true);
  assert.equal(speakerImportRouteSource.includes("error.reason ? { reason: error.reason } : {}"), true);
  assert.equal(speakerIntakeRouteSource.includes("error.reason ? { reason: error.reason } : {}"), true);
});

test("speaker routes use the dynamic event UUID and do not reject valid route eventIds", () => {
  for (const source of [
    speakersRouteSource,
    speakerDetailRouteSource,
    speakerImportRouteSource,
    speakerIntakeRouteSource,
    matrixSpeakerAssignmentRouteSource,
  ]) {
    assert.equal(source.includes("const { eventId"), true);
    assert.equal(source.includes('requestUrl.searchParams.get("eventId")'), false);
    assert.equal(source.includes("eventId ="), false);
  }
});

test("Matrix session speaker assignment route is authenticated and uses canonical write access", () => {
  assert.equal(matrixSpeakerAssignmentRouteSource.includes('import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";'), true);
  assert.equal(matrixSpeakerAssignmentRouteSource.includes('await assertEventAccessForUser(eventId, authResult.user, "write");'), true);
  assert.equal(matrixSpeakerAssignmentRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(matrixSpeakerAssignmentRouteSource.includes("reason: error.reason"), true);
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
});
