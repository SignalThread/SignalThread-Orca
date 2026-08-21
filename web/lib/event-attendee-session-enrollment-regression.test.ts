import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  coerceEnrollmentSource,
  coerceEnrollmentStatus,
  isInactiveEnrollmentStatus,
} from "../src/server/services/event-attendee-session-enrollment";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const service = readFileSync("src/server/services/event-attendee-session-enrollment.ts", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260626160000_add_attendee_session_enrollments/migration.sql",
  "utf8",
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} not found`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} not found after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("schema adds normalized attendee-session enrollment without JSON shortcuts", () => {
  const model = sourceBetween(
    schema,
    "model EventAttendeeSessionEnrollment {",
    "enum EventAttendeeSessionEnrollmentStatus {",
  );

  for (const field of [
    "eventId",
    "attendeeId",
    "matrixRowId",
    "enrollmentStatus",
    "source",
    "externalSessionRegistrationId",
    "integrationConnectionId",
    "registrationRecordId",
    "waitlistedAt",
    "cancelledAt",
    "checkedInAt",
  ]) {
    assert.match(model, new RegExp(`\\b${field}\\b`));
  }

  // The clean-database baseline pins live index names with `map:`, so these attributes
  // now carry a trailing argument. The uniqueness/index contract itself is unchanged.
  assert.match(model, /@@unique\(\[eventId, attendeeId, matrixRowId\][,)]/);
  assert.match(model, /@@index\(\[eventId, attendeeId, enrollmentStatus\][,)]/);
  assert.match(model, /@@index\(\[eventId, matrixRowId, enrollmentStatus\][,)]/);
  assert.equal(model.includes("Json"), false);
});

test("schema keeps enrollment separate from speaker and seating models", () => {
  const model = sourceBetween(
    schema,
    "model EventAttendeeSessionEnrollment {",
    "enum EventAttendeeSessionEnrollmentStatus {",
  );

  assert.match(model, /attendee\s+EventAttendee\s+@relation/);
  assert.match(model, /matrixRow\s+MatrixRow\s+@relation/);
  assert.equal(model.includes("SessionSpeakerAssignment"), false);
  assert.equal(model.includes("SeatingAttendee"), false);
  assert.equal(model.includes("SeatingAssignment"), false);
});

test("schema wires relation arrays onto event attendee session registration and integration models", () => {
  for (const snippet of [
    "attendeeSessionEnrollments   EventAttendeeSessionEnrollment[]",
    "sessionEnrollments  EventAttendeeSessionEnrollment[]",
    "sessionEnrollments     EventAttendeeSessionEnrollment[]",
    "sessionEnrollments          EventAttendeeSessionEnrollment[]",
  ]) {
    assert.ok(schema.includes(snippet), `Missing relation snippet: ${snippet}`);
  }
});

test("migration creates partial unique index for external session registration ids", () => {
  assert.match(migration, /CREATE TABLE "EventAttendeeSessionEnrollment"/);
  assert.match(migration, /"EventAttendeeSessionEnrollment_external_registration_key"/);
  assert.match(
    migration,
    /WHERE "integrationConnectionId" IS NOT NULL AND "externalSessionRegistrationId" IS NOT NULL/,
  );
});

test("status helpers hide cancelled and no-show enrollments by default", () => {
  assert.equal(isInactiveEnrollmentStatus("CANCELLED"), true);
  assert.equal(isInactiveEnrollmentStatus("NO_SHOW"), true);
  assert.equal(isInactiveEnrollmentStatus("REGISTERED"), false);
  assert.equal(coerceEnrollmentStatus("WAITLISTED"), "WAITLISTED");
  assert.equal(coerceEnrollmentStatus("NOT_A_STATUS"), null);
  assert.equal(coerceEnrollmentSource("CSV_IMPORT"), "CSV_IMPORT");
  assert.equal(coerceEnrollmentSource("MARKETING_CAMPAIGN"), null);
});

test("service exposes pass-one enrollment operations", () => {
  for (const fn of [
    "listAttendeeAgenda",
    "listSessionRoster",
    "addAttendeeToSession",
    "cancelAttendeeSessionEnrollment",
    "upsertEnrollmentsFromRegistrationImport",
    "upsertEnrollmentsFromCsvImport",
  ]) {
    assert.match(service, new RegExp(`export async function ${fn}\\b`));
  }
});

test("add service validates all event-scoped linked records before writing", () => {
  const validateBody = sourceBetween(service, "async function validateEnrollmentLinks", "async function assertExternalEnrollmentNotClaimed");
  assert.match(validateBody, /eventAttendee\.findFirst\(\{ where: \{ id: args\.attendeeId, eventId: args\.eventId \}/);
  assert.match(validateBody, /matrixRow\.findFirst\(\{ where: \{ id: args\.matrixRowId, eventId: args\.eventId \}/);
  assert.match(validateBody, /eventRegistrationRecord\.findFirst\(\{\s*where: \{ id: args\.registrationRecordId, eventId: args\.eventId \}/);
  assert.match(validateBody, /eventIntegrationConnection\.findFirst\(\{\s*where: \{ id: args\.integrationConnectionId, eventId: args\.eventId \}/);
  assert.match(validateBody, /registrationRecord\.attendeeId !== args\.attendeeId/);

  const addBody = sourceBetween(service, "export async function addAttendeeToSession", "export async function cancelAttendeeSessionEnrollment");
  assert.match(addBody, /await validateEnrollmentLinks/);
});

test("duplicate enrollment is prevented by composite lookup and update path", () => {
  const addBody = sourceBetween(service, "export async function addAttendeeToSession", "export async function cancelAttendeeSessionEnrollment");
  assert.match(addBody, /eventId_attendeeId_matrixRowId/);
  assert.match(addBody, /eventAttendeeSessionEnrollment\.update/);
  assert.match(addBody, /eventAttendeeSessionEnrollment\.create/);
});

test("cancel is soft lifecycle and lists hide inactive by default", () => {
  const cancelBody = sourceBetween(
    service,
    "export async function cancelAttendeeSessionEnrollment",
    "export async function upsertEnrollmentsFromRegistrationImport",
  );
  assert.match(cancelBody, /lifecycleData\("CANCELLED"/);
  assert.equal(cancelBody.includes(".delete("), false);

  const listBody = sourceBetween(service, "export async function listAttendeeAgenda", "export async function addAttendeeToSession");
  assert.match(listBody, /activeStatusWhere\(options\.includeInactive\)/);
});

test("service does not enroll through speaker seating or JSON blob paths", () => {
  assert.equal(service.includes("SessionSpeakerAssignment"), false);
  assert.equal(service.includes("SeatingAttendee"), false);
  assert.equal(service.includes("SeatingAssignment"), false);
  assert.equal(service.includes("Json"), false);
  assert.equal(service.includes("JSON.stringify"), false);
});
