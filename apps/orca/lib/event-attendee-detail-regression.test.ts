import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detail = readFileSync("app/(shell)/events/[eventId]/attendees/_components/attendee-detail-drawer.tsx", "utf8");
const service = readFileSync("src/server/services/event-attendee.ts", "utf8");

test("detail drawer has an Edit mode that PATCHes the attendee", () => {
  assert.match(detail, /startEdit/);
  assert.match(detail, /setIsEditing\(true\)/);
  assert.match(detail, /method: "PATCH"/);
  assert.match(detail, /attendees\/\$\{attendeeId\}`/);
});

test("editor sends profile + participation as separate payload sections", () => {
  // The PATCH body keeps Directory profile and attendee participation distinct.
  assert.match(detail, /profile: \{[\s\S]*firstName: edit\.firstName/);
  assert.match(detail, /participation: \{[\s\S]*registrationStatus: edit\.registrationStatus/);
});

test("provider/registration fields are read-only in the editor (no fake writeback)", () => {
  assert.match(detail, /hasExternalRegistration/);
  assert.match(detail, /Provider registration fields are read-only/);
  assert.match(detail, /will not pretend a local edit was written back/);
  // The editor does NOT send a registration block (provider data is not locally editable here).
  const saveStart = detail.indexOf("async function save");
  const saveBody = detail.slice(saveStart, detail.indexOf("async function lifecycle"));
  assert.doesNotMatch(saveBody, /registration: \{/);
});

test("service update routes profile edits to Directory and participation edits to the attendee row", () => {
  const start = service.indexOf("export async function updateEventAttendee");
  const body = service.slice(start, service.indexOf("export async function cancelEventAttendee"));
  assert.match(body, /if \(args\.profile\)/);
  assert.match(body, /eventDirectoryPerson\.update/);
  assert.match(body, /eventAttendee\.update/);
});

test("editing never erases roles (no role deletion in the update path)", () => {
  const start = service.indexOf("export async function updateEventAttendee");
  const body = service.slice(start, service.indexOf("export async function cancelEventAttendee"));
  assert.doesNotMatch(body, /eventDirectoryRole\.delete/);
});
