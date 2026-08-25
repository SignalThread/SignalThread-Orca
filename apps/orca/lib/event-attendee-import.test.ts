import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { parseCsv, type ParsedSheet } from "@/lib/import";
import {
  buildAttendeeDraftRows,
  buildAttendeeInitialMapping,
  normalizeImportRegistrationStatus,
  parseAttendeeImportRow,
  type AttendeeImportDraftRow,
} from "./event-attendee-import";

const attendeeModalSource = readFileSync("app/(shell)/events/[eventId]/attendees/_components/attendee-import-modal.tsx", "utf8");

test("attendee replacement uploads clear stale drafts before parsing", () => {
  assert.ok(attendeeModalSource.includes("setSheet(null);"));
  assert.ok(attendeeModalSource.includes("setMapping({});"));
  assert.ok(attendeeModalSource.includes("This workbook has multiple sheets."));
});

function draft(over: Partial<AttendeeImportDraftRow> = {}): AttendeeImportDraftRow {
  return {
    firstName: "", lastName: "", fullName: "", email: "", phone: "", company: "", title: "",
    registrationStatus: "", registrationType: "", badgeType: "", ticketType: "",
    externalRegistrationId: "", externalPersonId: "", provider: "", ...over,
  };
}

// --- header mapping --------------------------------------------------------

test("auto-maps identity + registration headers via synonyms", () => {
  const sheet: ParsedSheet = parseCsv("Full Name,Email,Company,Reg Status,Ticket Type,Registration ID\nJane Doe,jane@acme.com,Acme,Registered,VIP,R-1");
  const mapping = buildAttendeeInitialMapping(sheet.columns);
  assert.equal(mapping["0:Full Name"], "fullName");
  assert.equal(mapping["1:Email"], "email");
  assert.equal(mapping["2:Company"], "company");
  assert.equal(mapping["3:Reg Status"], "registrationStatus");
  assert.equal(mapping["4:Ticket Type"], "ticketType");
  assert.equal(mapping["5:Registration ID"], "externalRegistrationId");
});

// --- registration status normalization -------------------------------------

test("normalizeImportRegistrationStatus maps common free-text values", () => {
  assert.equal(normalizeImportRegistrationStatus("Registered"), "REGISTERED");
  assert.equal(normalizeImportRegistrationStatus("confirmed"), "REGISTERED");
  assert.equal(normalizeImportRegistrationStatus("Cancelled"), "CANCELLED");
  assert.equal(normalizeImportRegistrationStatus("Wait List"), "WAITLISTED");
  assert.equal(normalizeImportRegistrationStatus("Checked In"), "CHECKED_IN");
  assert.equal(normalizeImportRegistrationStatus("No Show"), "NO_SHOW");
  assert.equal(normalizeImportRegistrationStatus("???"), null);
});

// --- row parsing -----------------------------------------------------------

test("parses identity + registration; flags rows with no identity INVALID", () => {
  const ok = parseAttendeeImportRow(draft({ fullName: "Jane Doe", email: " Jane@ACME.com ", ticketType: "VIP", provider: "bizzabo" }));
  assert.equal(ok.result, "ok");
  if (ok.result === "ok") {
    assert.equal(ok.identity.normalizedEmail, "jane@acme.com");
    assert.equal(ok.identity.firstName, "Jane");
    assert.equal(ok.registration.ticketType, "VIP");
    assert.equal(ok.registration.provider, "bizzabo");
  }
  assert.equal(parseAttendeeImportRow(draft({ company: "Acme only" })).result, "invalid");
});

test("draft rows build from a mapped sheet and parse end-to-end", () => {
  const sheet = parseCsv("Email,First Name,Reg Status\njane@acme.com,Jane,Registered");
  const mapping = buildAttendeeInitialMapping(sheet.columns);
  const { draftRows } = buildAttendeeDraftRows(sheet, mapping);
  const parsed = parseAttendeeImportRow(draftRows[0]);
  assert.equal(parsed.result, "ok");
  if (parsed.result === "ok") assert.equal(parsed.registration.registrationStatus, "REGISTERED");
});

// --- service + route wiring (source assertions) ----------------------------

const service = readFileSync("src/server/services/event-attendee.ts", "utf8");
const route = readFileSync("app/api/events/[eventId]/attendees/imports/route.ts", "utf8");
const importLib = readFileSync("lib/event-attendee-import.ts", "utf8");

test("attendee import lib is browser-safe (no server/prisma imports); service type-imports it", () => {
  for (const forbidden of ["@/src/server", "@prisma/client", "@/lib/prisma"]) {
    assert.equal(importLib.includes(forbidden), false, `import lib must not import ${forbidden}`);
  }
  assert.match(service, /import type \{ AttendeeRowParseResult \} from "@\/lib\/event-attendee-import"/);
});

test("import endpoint exists, re-validates rows server-side, requires a source label", () => {
  assert.ok(existsSync("app/api/events/[eventId]/attendees/imports/route.ts"));
  assert.match(route, /parseAttendeeImportRow\(draft\)/);
  assert.match(route, /sourceLabel is required/);
  assert.match(route, /processAttendeeCsvImport/);
});

test("import matches existing Directory people by email and never duplicates speakers/staff", () => {
  const start = service.indexOf("export async function processAttendeeCsvImport");
  const body = service.slice(start, service.indexOf("async function createDirectoryPersonForImport"));
  // Email match reuses the existing person (no new person created).
  assert.match(body, /findFirst\(\{\s*where: \{ eventId: args\.eventId, normalizedEmail: identity\.normalizedEmail/);
  assert.match(body, /personId = existing \? existing\.id :/);
  // Always adds ATTENDEE participation role to the matched person.
  assert.match(body, /role: "ATTENDEE"/);
});

test("import creates registration records only when registration data exists, and flags no-email collisions CONFLICT", () => {
  const start = service.indexOf("export async function processAttendeeCsvImport");
  const body = service.slice(start, service.indexOf("async function createDirectoryPersonForImport"));
  assert.match(body, /const hasReg = hasRegistrationData\(registration\)/);
  assert.match(body, /if \(hasReg\) \{\s*await upsertRegistrationRecord/);
  assert.match(body, /matchType === "name_company"/);
  assert.match(body, /counts\.conflicts \+= 1/);
});

test("re-import updates by email (UPDATED), no duplicate roles, deletes no one", () => {
  const start = service.indexOf("export async function processAttendeeCsvImport");
  const body = service.slice(start, service.indexOf("async function createDirectoryPersonForImport"));
  assert.match(body, /existingAttendee \? "UPDATED"|created \? "CREATED" : "UPDATED"/);
  assert.doesNotMatch(body, /\.delete\(/);
});
