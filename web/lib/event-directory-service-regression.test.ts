import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertValidRole,
  buildDirectoryEmailRecipientPlan,
  buildDirectoryListWhere,
  decideDeleteOutcome,
  deriveDirectoryDisplayName,
  DirectoryServiceError,
  displayEventDirectoryModuleUsage,
  displayEventDirectorySourceLabel,
  expandDirectoryRoleFilter,
  hasUsableIdentity,
  normalizeDirectoryEmail,
} from "../src/server/services/event-directory";

const serviceSource = readFileSync("src/server/services/event-directory.ts", "utf8");
const emailRouteSource = readFileSync("app/api/events/[eventId]/directory/email/route.ts", "utf8");

// --- pure identity helpers -------------------------------------------------

test("normalizeDirectoryEmail lowercases/trims and rejects empties/bad shapes", () => {
  assert.equal(normalizeDirectoryEmail("  Jane.Doe@Example.COM "), "jane.doe@example.com");
  assert.equal(normalizeDirectoryEmail(""), null);
  assert.equal(normalizeDirectoryEmail("   "), null);
  assert.equal(normalizeDirectoryEmail("not-an-email"), null);
  assert.equal(normalizeDirectoryEmail(null), null);
});

test("deriveDirectoryDisplayName prefers explicit, then full name, then email", () => {
  assert.equal(deriveDirectoryDisplayName({ displayName: "Jane D." }), "Jane D.");
  assert.equal(deriveDirectoryDisplayName({ firstName: "Jane", lastName: "Doe" }), "Jane Doe");
  assert.equal(deriveDirectoryDisplayName({ email: "jane@example.com" }), "jane@example.com");
  assert.equal(deriveDirectoryDisplayName({}), "Unnamed contact");
});

test("hasUsableIdentity requires email or a name", () => {
  assert.equal(hasUsableIdentity({ email: "x@y.com" }), true);
  assert.equal(hasUsableIdentity({ firstName: "Jane" }), true);
  assert.equal(hasUsableIdentity({ company: "Acme" }), false);
  assert.equal(hasUsableIdentity({}), false);
});

test("directory email recipient plan validates, dedupes, and skips people without sendable email", () => {
  const plan = buildDirectoryEmailRecipientPlan([
    { id: "person-1", displayName: "Ali Kamyab", email: " Ali@Example.com " },
    { id: "person-2", displayName: "Ali duplicate", email: "ali@example.com" },
    { id: "person-3", displayName: "Missing Email", email: null },
    { id: "person-4", displayName: "Invalid Email", email: "not-an-email" },
  ]);

  assert.deepEqual(plan.validRecipients, [
    { personId: "person-1", displayName: "Ali Kamyab", email: "Ali@Example.com" },
  ]);
  assert.deepEqual(
    plan.skippedRecipients.map((recipient) => [recipient.personId, recipient.reason]),
    [
      ["person-3", "missing_email"],
      ["person-4", "invalid_email"],
    ],
  );
});

test("assertValidRole accepts known roles and rejects unknown", () => {
  assert.equal(assertValidRole("SPEAKER"), "SPEAKER");
  assert.equal(assertValidRole("VENDOR"), "VENDOR");
  assert.throws(() => assertValidRole("WIZARD"), (e: unknown) => e instanceof DirectoryServiceError && e.code === "DIRECTORY_ROLE_INVALID");
});

// --- delete semantics ------------------------------------------------------

test("decideDeleteOutcome hard-deletes only local-only people", () => {
  assert.deepEqual(decideDeleteOutcome({ moduleLinks: 0, externalIdentities: 0, importRows: 0 }), {
    outcome: "hard_deleted",
    dependencies: [],
  });
});

test("decideDeleteOutcome soft-removes when module links / external identity / import history exist", () => {
  const withLinks = decideDeleteOutcome({ moduleLinks: 2, externalIdentities: 0, importRows: 0 });
  assert.equal(withLinks.outcome, "soft_removed");
  assert.deepEqual(withLinks.dependencies, ["module_links"]);

  const withAll = decideDeleteOutcome({ moduleLinks: 1, externalIdentities: 1, importRows: 3 });
  assert.equal(withAll.outcome, "soft_removed");
  assert.deepEqual(withAll.dependencies, ["module_links", "external_identities", "import_history"]);
});

// --- list where builder ----------------------------------------------------

test("buildDirectoryListWhere scopes by event, searches multiple fields, and filters by role/source/status", () => {
  const where = buildDirectoryListWhere("event-1", {
    search: "acme",
    role: "VIP",
    sourceType: "CSV_IMPORT",
    status: "ACTIVE",
  });
  assert.equal(where.eventId, "event-1");
  assert.equal(where.status, "ACTIVE");
  assert.ok(Array.isArray(where.OR) && where.OR.length === 5);
  assert.deepEqual(where.roles, { some: { role: { in: ["VIP"] }, source: { type: "CSV_IMPORT" } } });
});

test("role filters include legacy aliases for canonical UI roles", () => {
  assert.deepEqual(expandDirectoryRoleFilter("PROSPECT"), ["PROSPECT", "MARKETING_CONTACT"]);
  assert.deepEqual(expandDirectoryRoleFilter("MARKETING_CONTACT"), ["PROSPECT", "MARKETING_CONTACT"]);
  assert.deepEqual(expandDirectoryRoleFilter("ATTENDEE"), ["ATTENDEE", "REGISTRANT"]);
  assert.deepEqual(expandDirectoryRoleFilter("REGISTRANT"), ["ATTENDEE", "REGISTRANT"]);
});

test("buildDirectoryListWhere hides MERGED tombstones by default", () => {
  const where = buildDirectoryListWhere("event-1", {});
  assert.deepEqual(where.status, { notIn: ["MERGED", "REMOVED"] });
  assert.equal(where.OR, undefined);
  assert.equal(where.roles, undefined);
});

test("source display separates origin from module usage", () => {
  assert.equal(displayEventDirectorySourceLabel({ type: "SEATING_MODULE", label: "Seating module" }), "Backfilled");
  assert.equal(displayEventDirectorySourceLabel({ type: "SPEAKER_MODULE", label: "Speakers module" }), "Backfilled");
  assert.equal(displayEventDirectorySourceLabel({ type: "CSV_IMPORT", label: "CSV import" }), "CSV upload");
  assert.equal(displayEventDirectoryModuleUsage("SEATING_ATTENDEE"), "Seating");
  assert.equal(displayEventDirectoryModuleUsage("EVENT_PERSON"), "Staffing");
});

// --- service guards (source assertions) ------------------------------------

test("every mutating service enforces event WRITE access; reads enforce READ", () => {
  for (const fn of ["createEventDirectoryPerson", "updateEventDirectoryPerson", "deleteEventDirectoryPerson", "addEventDirectoryRole", "removeEventDirectoryRole", "mergeEventDirectoryPeople"]) {
    const start = serviceSource.indexOf(`export async function ${fn}`);
    assert.ok(start >= 0, `${fn} exported`);
    const body = serviceSource.slice(start, start + 600);
    assert.match(body, /assertEventAccessForUser\(args\.eventId, args\.user, "write"\)/, `${fn} must assert write`);
  }
  for (const fn of ["listEventDirectoryPeople", "getEventDirectoryPerson", "getEventDirectorySummary"]) {
    const start = serviceSource.indexOf(`export async function ${fn}`);
    const body = serviceSource.slice(start, start + 600);
    assert.match(body, /assertEventAccessForUser\(args\.eventId, args\.user, "read"\)/, `${fn} must assert read`);
  }
});

test("create checks deterministic email duplicate and returns possible_duplicate", () => {
  const start = serviceSource.indexOf("export async function createEventDirectoryPerson");
  const body = serviceSource.slice(start, start + 1600);
  assert.match(body, /detectDirectoryDuplicate\(\{ eventId: args\.eventId, normalizedEmail \}\)/);
  assert.match(body, /status: "possible_duplicate"/);
});

test("role add is idempotent and never auto-creates beyond the unique (event,person,role)", () => {
  const start = serviceSource.indexOf("export async function addEventDirectoryRole");
  const body = serviceSource.slice(start, start + 900);
  assert.match(body, /eventId_personId_role/);
  assert.match(body, /return \{ created: false, roleId: existing\.id \}/);
});

test("removing a role never deletes the person", () => {
  const start = serviceSource.indexOf("export async function removeEventDirectoryRole");
  const body = serviceSource.slice(start, start + 900);
  assert.match(body, /never deletes the person/);
  assert.doesNotMatch(body, /eventDirectoryPerson\.delete/);
});

test("merge moves roles/identities/links, preserves import history, and tombstones the source as MERGED", () => {
  const start = serviceSource.indexOf("export async function mergeEventDirectoryPeople");
  const body = serviceSource.slice(start, serviceSource.indexOf("export ", start + 50));
  assert.match(body, /Cross-event merge is not allowed/);
  assert.match(body, /eventDirectoryImportRow\.updateMany/);
  assert.match(body, /status: "MERGED"/);
});

test("duplicate detection never auto-merges name+company matches (returns match type only)", () => {
  const start = serviceSource.indexOf("export async function detectDirectoryDuplicate");
  const end = serviceSource.indexOf("export ", start + 50);
  const body = serviceSource.slice(start, end);
  assert.match(body, /matchType: "name_company"/);
  assert.doesNotMatch(body, /\.update\(|\.delete\(/);
});

test("module link enforces (event,module,moduleRecordId) uniqueness idempotently", () => {
  const start = serviceSource.indexOf("export async function linkDirectoryPersonToModuleRecord");
  const body = serviceSource.slice(start, start + 1200);
  assert.match(body, /eventId_module_moduleRecordId/);
  assert.match(body, /return \{ created: false/);
});

test("directory email action uses the existing email provider seam and honest no-provider statuses", () => {
  const start = serviceSource.indexOf("export async function sendEventDirectoryEmail");
  assert.ok(start >= 0, "sendEventDirectoryEmail exported");
  const body = serviceSource.slice(start, start + 3600);

  assert.match(body, /assertEventAccessForUser\(args\.eventId, args\.user, "write"\)/);
  assert.match(body, /buildDirectoryEmailRecipientPlan/);
  assert.match(body, /args\.provider \?\? getEmailProvider\(\)/);
  assert.match(body, /provider\.send\(\{ to: recipient\.email, subject, body \}\)/);
  assert.match(body, /skippedNoProvider/);
  assert.match(body, /skippedNoEmail: plan\.skippedRecipients\.length/);
  // Migrated to the canonical event-activity service (module EVENT_DIRECTORY, action SENT).
  assert.match(body, /recordEventActivity/);
  assert.match(body, /module: "EVENT_DIRECTORY"/);
  assert.match(body, /action: "SENT"/);
  assert.doesNotMatch(body, /MarketingEmailSend/);
  assert.doesNotMatch(body, /fake success/i);
});

test("directory email route resolves auth and delegates to the service", () => {
  assert.match(emailRouteSource, /sendEventDirectoryEmail/);
  assert.match(emailRouteSource, /resolveDirectoryUser\(request\)/);
  assert.match(emailRouteSource, /personIds: parsed\.body\.personIds/);
  assert.match(emailRouteSource, /subject: parsed\.body\.subject/);
  assert.match(emailRouteSource, /body: parsed\.body\.body/);
  assert.match(emailRouteSource, /toDirectoryErrorResponse/);
});
