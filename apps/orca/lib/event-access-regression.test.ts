import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventAccessSource = readFileSync("lib/event-access.ts", "utf8");
const eventsServiceSource = readFileSync("lib/events.ts", "utf8");
const timelineServiceSource = readFileSync("src/server/services/timeline.ts", "utf8");
const timelineItemsRouteSource = readFileSync("app/api/events/[eventId]/timeline-items/route.ts", "utf8");
const matrixRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/route.ts", "utf8");
const seatingRouteSource = readFileSync("app/api/events/[eventId]/seating/route.ts", "utf8");
const seatingAssignRouteSource = readFileSync("app/api/events/[eventId]/seating/assign/route.ts", "utf8");
const seatingUnassignRouteSource = readFileSync("app/api/events/[eventId]/seating/unassign/route.ts", "utf8");
const speakersServiceSource = readFileSync("src/server/services/speakers.ts", "utf8");
const matrixSpeakerAssignmentRouteSource = readFileSync(
  "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/speakers/[speakerId]/route.ts",
  "utf8",
);
const eventLayoutSource = readFileSync("app/(shell)/events/[eventId]/layout.tsx", "utf8");
const eventPageSource = readFileSync("app/(shell)/events/[eventId]/page.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("canonical event access result carries user, org, app role, event role, permissions, and reason", () => {
  for (const field of [
    "userId",
    "orgId",
    "appRole",
    "eventId",
    "eventOrgId",
    "eventRole",
    "canView",
    "canEdit",
    "reason",
  ]) {
    assert.equal(eventAccessSource.includes(`${field}:`), true, field);
  }
});

test("org-wide roles can view and edit active-org events without EventMember rows", () => {
  const accessSource = sourceBetween(
    eventAccessSource,
    "if (canListOrganizationEvents(user.role))",
    "if (!eventRole)",
  );

  assert.equal(accessSource.includes("allowedDecision(event.id, event.orgId, user, eventRole, true)"), true);
  assert.equal(eventAccessSource.includes('import { canListOrganizationEvents } from "@/lib/events";'), true);
  assert.equal(eventsServiceSource.includes("role === UserRole.SUPER_ADMIN"), true);
  assert.equal(eventsServiceSource.includes("role === UserRole.OWNER"), true);
  assert.equal(eventsServiceSource.includes("role === UserRole.ADMIN"), true);
  assert.equal(eventsServiceSource.includes("UserRole.MEMBER ||"), false);
});

test("ordinary org membership without event membership is denied consistently", () => {
  const membershipRequiredSource = sourceBetween(
    eventAccessSource,
    "if (!eventRole)",
    "return allowedDecision(",
  );

  assert.equal(membershipRequiredSource.includes('"EVENT_MEMBERSHIP_REQUIRED"'), true);
  assert.equal(eventAccessSource.includes('throw new EventAccessError("Event membership required", 403'), true);
});

test("event members can view Timeline through the canonical helper", () => {
  assert.equal(timelineServiceSource.includes('assertTimelineEventAccess(eventId, user, "read")'), true);
  assert.equal(timelineServiceSource.includes("assertEventAccessForUser(eventId, user, accessType)"), true);
  assert.equal(timelineItemsRouteSource.includes("listTimelineItems(eventId, authResult.user"), true);
});

test("event viewer can view but cannot edit where write access is required", () => {
  assert.equal(eventAccessSource.includes("eventRole !== EventMemberRole.EVENT_VIEWER"), true);
  assert.equal(eventAccessSource.includes('accessType === "write" && !decision.canEdit'), true);
  assert.equal(eventAccessSource.includes('"EVENT_EDITOR_ROLE_REQUIRED"'), true);
  assert.equal(timelineServiceSource.includes('assertTimelineEventAccess(eventId, user, "write")'), true);
});

test("event editor and event admin edit permissions are controlled by EventMemberRole", () => {
  assert.equal(eventAccessSource.includes("EventMemberRole.EVENT_VIEWER"), true);
  assert.equal(eventAccessSource.includes("eventRole !== EventMemberRole.EVENT_VIEWER"), true);
  assert.equal(timelineServiceSource.includes("createTimelineItem("), true);
  assert.equal(timelineServiceSource.includes("updateTimelineItem("), true);
  assert.equal(timelineServiceSource.includes("deleteTimelineItem("), true);
});

test("Timeline, Run of Show, and Seating routes use the same canonical event access helper", () => {
  assert.equal(timelineServiceSource.includes('assertEventAccessForUser(eventId, user, accessType)'), true);
  assert.equal(matrixRouteSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "read")'), true);
  assert.equal(seatingRouteSource.includes('assertEventAccessForUser(eventId, authResult.user, "read")'), true);
  assert.equal(seatingAssignRouteSource.includes('assertEventAccessForUser(eventId, authResult.user, "write")'), true);
  assert.equal(seatingUnassignRouteSource.includes('assertEventAccessForUser(eventId, authResult.user, "write")'), true);
  assert.equal(speakersServiceSource.includes("await assertEventAccessForUser(eventId, user, accessType);"), true);
  assert.equal(matrixSpeakerAssignmentRouteSource.includes('await assertEventAccessForUser(eventId, authResult.user, "write");'), true);
});

test("unauthorized event access produces stable 403 reasons instead of module-specific messages", () => {
  assert.equal(eventAccessSource.includes('"EVENT_OUTSIDE_ACTIVE_ORG"'), true);
  assert.equal(eventAccessSource.includes('"EVENT_MEMBERSHIP_REQUIRED"'), true);
  assert.equal(eventAccessSource.includes("status: number;"), true);
  assert.equal(matrixRouteSource.includes("reason: error.reason"), true);
  assert.equal(seatingRouteSource.includes("reason: error.reason"), true);
  assert.equal(speakersServiceSource.includes("new SpeakerServiceError(error.message, error.status, error.reason)"), true);
  assert.equal(matrixSpeakerAssignmentRouteSource.includes("reason: error.reason"), true);
});

test("server-rendered event shell and command center resolve the request user before event reads", () => {
  assert.match(eventLayoutSource, /ensureProvisionedUserAndContext\(\)/);
  assert.match(eventLayoutSource, /assertEventAccessForUser\(eventId, \{[\s\S]*authContext\.appUserId/);
  assert.match(eventPageSource, /ensureProvisionedUserAndContext\(\)/);
  assert.match(eventPageSource, /getEventCommandCenter\(eventId, \{[\s\S]*authContext\.appUserId/);
});
