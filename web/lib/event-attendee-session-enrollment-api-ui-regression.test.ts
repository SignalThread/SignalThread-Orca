import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helperSource = readFileSync("app/api/events/[eventId]/attendees/_lib/session-enrollment-route-helpers.ts", "utf8");
const attendeeAgendaRouteSource = readFileSync("app/api/events/[eventId]/attendees/[attendeeId]/agenda/route.ts", "utf8");
const attendeeAgendaCancelRouteSource = readFileSync(
  "app/api/events/[eventId]/attendees/[attendeeId]/agenda/[enrollmentId]/cancel/route.ts",
  "utf8",
);
const sessionRosterRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/attendees/route.ts", "utf8");
const sessionRosterCancelRouteSource = readFileSync(
  "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/attendees/[enrollmentId]/cancel/route.ts",
  "utf8",
);
const attendeeDetailDrawerSource = readFileSync(
  "app/(shell)/events/[eventId]/attendees/_components/attendee-detail-drawer.tsx",
  "utf8",
);
const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const matrix2DetailsDrawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const serviceSource = readFileSync("src/server/services/event-attendee-session-enrollment.ts", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} not found`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} not found after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("planner enrollment routes are thin adapters over the canonical service", () => {
  assert.match(attendeeAgendaRouteSource, /listAttendeeAgenda\(eventId, attendeeId/);
  assert.match(attendeeAgendaRouteSource, /addAttendeeToSession\(eventId, attendeeId, body\.matrixRowId/);
  assert.match(sessionRosterRouteSource, /listSessionRoster\(eventId, matrixRowId/);
  assert.match(sessionRosterRouteSource, /addAttendeeToSession\(eventId, body\.attendeeId, matrixRowId/);
  assert.match(attendeeAgendaCancelRouteSource, /cancelAttendeeSessionEnrollment\(eventId/);
  assert.match(sessionRosterCancelRouteSource, /cancelAttendeeSessionEnrollment\(eventId/);

  for (const source of [
    attendeeAgendaRouteSource,
    attendeeAgendaCancelRouteSource,
    sessionRosterRouteSource,
    sessionRosterCancelRouteSource,
  ]) {
    assert.doesNotMatch(source, /getPrisma\(|prisma\./, "routes should not duplicate persistence logic");
    assert.doesNotMatch(source, /SessionSpeakerAssignment|SeatingAttendee|SeatingAssignment/, "routes must not use speaker or seating models");
  }
});

test("agenda and roster endpoints validate route ids body and includeInactive", () => {
  assert.match(helperSource, /uuidSchema = z\.string\(\)\.uuid\(\)/);
  assert.match(helperSource, /addAgendaSessionBodySchema/);
  assert.match(helperSource, /matrixRowId: uuidSchema/);
  assert.match(helperSource, /addRosterAttendeeBodySchema/);
  assert.match(helperSource, /attendeeId: uuidSchema/);
  assert.match(helperSource, /parseIncludeInactive/);
  assert.match(helperSource, /includeInactive === "1" \|\| parsed\.includeInactive === "true"/);
  assert.match(attendeeAgendaRouteSource, /includeInactive: parseIncludeInactive\(request\)/);
  assert.match(sessionRosterRouteSource, /includeInactive: parseIncludeInactive\(request\)/);
});

test("event read and write access are enforced server-side", () => {
  assert.match(helperSource, /assertEventAccessForUser\(eventId, user, accessType\)/);

  assert.match(attendeeAgendaRouteSource, /assertEnrollmentEventAccess\(eventId, auth\.user, "read"\)/);
  assert.match(sessionRosterRouteSource, /assertEnrollmentEventAccess\(eventId, auth\.user, "read"\)/);

  for (const source of [attendeeAgendaRouteSource, attendeeAgendaCancelRouteSource, sessionRosterRouteSource, sessionRosterCancelRouteSource]) {
    if (source.includes("postHandler") || source.includes("cancelHandler")) {
      assert.match(source, /assertEnrollmentEventAccess\(eventId, auth\.user, "write"\)/);
    }
  }
});

test("duplicate add updates the same normalized enrollment and cancel hides by default", () => {
  const addBody = sourceBetween(serviceSource, "export async function addAttendeeToSession", "export async function cancelAttendeeSessionEnrollment");
  assert.match(addBody, /eventId_attendeeId_matrixRowId/);
  assert.match(addBody, /eventAttendeeSessionEnrollment\.update/);
  assert.match(addBody, /eventAttendeeSessionEnrollment\.create/);

  const listBody = sourceBetween(serviceSource, "function activeStatusWhere", "function lifecycleData");
  assert.match(listBody, /includeInactive \? \{\} : \{ enrollmentStatus: \{ notIn: Array\.from\(INACTIVE_ENROLLMENT_STATUSES\) \} \}/);

  const cancelBody = sourceBetween(
    serviceSource,
    "export async function cancelAttendeeSessionEnrollment",
    "export async function upsertEnrollmentsFromRegistrationImport",
  );
  assert.match(cancelBody, /lifecycleData\("CANCELLED"/);
  assert.doesNotMatch(cancelBody, /\.delete\(/);
});

test("attendee detail keeps attendee management while blocking session agenda enrollment", () => {
  assert.match(attendeeDetailDrawerSource, /Sessions \/ Agenda/);
  assert.match(attendeeDetailDrawerSource, /SessionRegistrationUnavailableCard/);
  assert.match(attendeeDetailDrawerSource, /shouldGateSessionRegistration/);
});

test("session workspace replaces Attendee Roster controls with the shared blocked treatment", () => {
  assert.match(sessionWorkspaceSource, /function AttendeeRosterSection/);
  assert.match(sessionWorkspaceSource, /return sessionRegistrationComingSoon \? \(/);
  assert.match(sessionWorkspaceSource, /SessionRegistrationUnavailableCard/);
  assert.match(sessionWorkspaceSource, /<AttendeeRosterSection eventId=\{eventId\} matrixRowId=\{session\.rowId\} \/>/);
});

test("Run of Show Details replaces attendee registration controls with the shared blocked treatment", () => {
  assert.match(matrix2DetailsDrawerSource, /Session details/);
  assert.match(matrix2DetailsDrawerSource, /sessionRegistrationComingSoon \? <SessionRegistrationUnavailableCard compact \/>/);
  assert.match(matrix2DetailsDrawerSource, /Save changes/);
  assert.doesNotMatch(matrix2DetailsDrawerSource, /SessionSpeakerAssignment|SeatingAttendee|SeatingAssignment/);
});

test("speaker assignment and seating remain separate from attendee enrollment", () => {
  const passTwoSources = [
    helperSource,
    attendeeAgendaRouteSource,
    attendeeAgendaCancelRouteSource,
    sessionRosterRouteSource,
    sessionRosterCancelRouteSource,
    attendeeDetailDrawerSource,
  ].join("\n");

  assert.doesNotMatch(passTwoSources, /SessionSpeakerAssignment/);
  assert.doesNotMatch(passTwoSources, /SeatingAttendee|SeatingAssignment|seatingAttendee/);
  assert.match(sessionWorkspaceSource, /SpeakerPicker/);
  assert.match(sessionWorkspaceSource, /AttendeeRosterSection/);
  assert.match(sessionWorkspaceSource, /\/api\/events\/\$\{eventId\}\/speakers/);
  assert.match(sessionWorkspaceSource, /\/api\/events\/\$\{eventId\}\/attendees\?limit=200/);
});
