import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAttendeeListWhere,
  coerceAttendanceStatus,
  coerceAttendeeSource,
  coerceRegistrationStatus,
  hasRegistrationData,
  syncStatusForSource,
} from "../src/server/services/event-attendee";

const service = readFileSync("src/server/services/event-attendee.ts", "utf8");
const listRoute = readFileSync("app/api/events/[eventId]/attendees/route.ts", "utf8");
const itemRoute = readFileSync("app/api/events/[eventId]/attendees/[attendeeId]/route.ts", "utf8");

// --- pure enum coercion ----------------------------------------------------

test("status/source coercion accepts valid enum values and rejects junk", () => {
  assert.equal(coerceRegistrationStatus("REGISTERED"), "REGISTERED");
  assert.equal(coerceRegistrationStatus("nope"), null);
  assert.equal(coerceAttendanceStatus("EXPECTED"), "EXPECTED");
  assert.equal(coerceAttendanceStatus("???"), null);
  assert.equal(coerceAttendeeSource("CSV_IMPORT"), "CSV_IMPORT");
  assert.equal(coerceAttendeeSource("bizzabo"), null); // provider name is not a source enum
});

// --- registration data detection -------------------------------------------

test("hasRegistrationData is true only with real provider/registration fields", () => {
  assert.equal(hasRegistrationData(null), false);
  assert.equal(hasRegistrationData({ provider: "manual" }), false);
  assert.equal(hasRegistrationData({ provider: "bizzabo" }), true);
  assert.equal(hasRegistrationData({ externalRegistrationId: "R123" }), true);
  assert.equal(hasRegistrationData({ ticketType: "VIP Pass" }), true);
  assert.equal(hasRegistrationData({ registrationType: "Full Access" }), true);
  assert.equal(hasRegistrationData({}), false);
});

test("sync status is LOCAL_ONLY for manual and SYNCED for provider/integration", () => {
  assert.equal(syncStatusForSource("MANUAL", false), "LOCAL_ONLY");
  assert.equal(syncStatusForSource("CSV_IMPORT", false), "LOCAL_ONLY");
  assert.equal(syncStatusForSource("REGISTRATION_INTEGRATION", false), "SYNCED");
  assert.equal(syncStatusForSource("CSV_IMPORT", true), "SYNCED");
});

// --- list where builder ----------------------------------------------------

test("attendee list where scopes by event and filters by participation + person role", () => {
  const where = buildAttendeeListWhere("e1", { registrationStatus: "REGISTERED", source: "CSV_IMPORT", role: "VIP", search: "acme" });
  assert.equal(where.eventId, "e1");
  assert.equal(where.registrationStatus, "REGISTERED");
  assert.equal(where.source, "CSV_IMPORT");
  assert.ok(where.person);
  assert.deepEqual((where.person as { roles?: unknown }).roles, { some: { role: "VIP" } });
});

// --- service behavior (source assertions) ----------------------------------

test("create links/reuses a Directory person by email and never duplicates", () => {
  const start = service.indexOf("async function resolveDirectoryPersonForAttendee");
  const body = service.slice(start, service.indexOf("async function ensureAttendeeRole"));
  assert.match(body, /findFirst\(\{\s*where: \{ eventId: args\.eventId, normalizedEmail/);
  assert.match(body, /return \{ personId: existing\.id, createdPerson: false \}/);
});

test("every attendee gets the ATTENDEE directory role (participation implies the role)", () => {
  assert.match(service, /addEventDirectoryRole\(\{ eventId, personId, role: "ATTENDEE", sourceId, user \}\)/);
});

test("speaker and attendee overlap reuses Directory identity without mutating Speaker records", () => {
  const resolveBody = service.slice(
    service.indexOf("async function resolveDirectoryPersonForAttendee"),
    service.indexOf("async function ensureAttendeeRole"),
  );
  assert.match(resolveBody, /where: \{ eventId: args\.eventId, normalizedEmail/);
  assert.match(resolveBody, /await ensureAttendeeRole\(args\.eventId, existing\.id/);

  const listBody = service.slice(
    service.indexOf("export async function listEventAttendees"),
    service.indexOf("export type AttendeeSummaryCounts"),
  );
  assert.match(listBody, /roles: \{ select: \{ role: true \} \}/);
  assert.match(listBody, /roles: \[\.\.\.new Set\(row\.person\.roles\.map\(\(r\) => r\.role\)\)\]/);
  assert.doesNotMatch(service, /speaker\.(create|update|delete|upsert)/i);
});

test("a registration record is created only when real registration data exists", () => {
  const start = service.indexOf("export async function createEventAttendee");
  const body = service.slice(start, service.indexOf("export async function upsertRegistrationRecord"));
  assert.match(body, /const hasReg = hasRegistrationData\(reg\)/);
  assert.match(body, /if \(hasReg && reg\) \{\s*await upsertRegistrationRecord/);
});

test("update separates Directory profile edits from attendee participation edits", () => {
  const start = service.indexOf("export async function updateEventAttendee");
  const body = service.slice(start, service.indexOf("export async function cancelEventAttendee"));
  assert.match(body, /eventDirectoryPerson\.update/); // profile -> directory
  assert.match(body, /eventAttendee\.update/); // participation -> attendee
  assert.match(body, /Participation edits flow to the attendee row only/);
});

test("cancel is soft (keeps row); delete removes participation + ATTENDEE role but keeps the person", () => {
  const cancel = service.slice(service.indexOf("export async function cancelEventAttendee"), service.indexOf("export async function deleteEventAttendee"));
  assert.match(cancel, /registrationStatus: "CANCELLED", attendanceStatus: "CANCELLED"/);
  const del = service.slice(service.indexOf("export async function deleteEventAttendee"));
  assert.match(del, /eventAttendee\.delete/);
  assert.match(del, /eventDirectoryRole\.deleteMany/);
  assert.match(del, /role: "ATTENDEE"/);
  assert.doesNotMatch(del, /eventDirectoryPerson\.delete/);
});

// --- routes thin + delegate ------------------------------------------------

test("attendee routes exist, resolve the user, and delegate to the service", () => {
  assert.ok(existsSync("app/api/events/[eventId]/attendees/route.ts"));
  assert.ok(existsSync("app/api/events/[eventId]/attendees/[attendeeId]/route.ts"));
  for (const src of [listRoute, itemRoute]) {
    assert.match(src, /resolveAttendeeUser\(request\)/);
    assert.match(src, /toAttendeeErrorResponse\(/);
  }
  assert.match(listRoute, /listEventAttendees/);
  assert.match(listRoute, /createEventAttendee/);
  assert.match(itemRoute, /updateEventAttendee/);
  assert.match(itemRoute, /deleteEventAttendee/);
  assert.match(itemRoute, /cancelEventAttendee/);
});
