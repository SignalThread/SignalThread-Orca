import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const importUtilsSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-csv-import-utils.ts",
  "utf8",
);
const speakersServiceSource = readFileSync("src/server/services/speakers.ts", "utf8");
const exportServiceSource = readFileSync("src/server/services/speaker-export.ts", "utf8");
const exportRouteSource = readFileSync("app/api/events/[eventId]/speakers/export/route.ts", "utf8");
const directorySource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-directory.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("CSV import mapping supports enriched speaker fields", () => {
  for (const field of ["topics", "avNeeds", "travelNeeds", "dietaryRestrictions", "linkedinUrl", "websiteUrl"]) {
    assert.equal(importUtilsSource.includes(`"${field}"`), true, `import utils missing field: ${field}`);
    assert.equal(
      importUtilsSource.includes(`mapped.${field} = value`),
      true,
      `buildMappedRows must map ${field}`,
    );
  }
  // Existing required mapping behavior preserved
  assert.equal(importUtilsSource.includes('{ value: "firstName", label: "First name", required: true }'), true);
  assert.equal(importUtilsSource.includes('{ value: "lastName", label: "Last name", required: true }'), true);
});

test("import service persists enriched fields and keeps duplicate handling", () => {
  const importSource = sourceBetween(
    speakersServiceSource,
    "export async function importSpeakersFromMappedRows",
    "export async function getSpeakerForPublicIntake",
  );
  for (const field of ["avNeeds", "travelNeeds", "dietaryRestrictions", "linkedinUrl", "websiteUrl", "topics"]) {
    assert.equal(importSource.includes(field), true, `import must persist ${field}`);
  }
  // Topics parsed into normalized array, not stored as raw text
  assert.equal(importSource.includes("split(/[;,]/)"), true);
  // Duplicate handling preserved (email + name keys)
  assert.equal(importSource.includes("seenEmails"), true);
  assert.equal(importSource.includes("seenNames"), true);
  assert.equal(importSource.includes("summary.duplicates += 1"), true);
  // Event scope: creation always pins eventId from the authorized call
  assert.equal(importSource.includes('await assertEventAccess(eventId, user, "write")'), true);
});

test("speaker export includes readiness status and is event-scoped", () => {
  const exportSource = sourceBetween(exportServiceSource, "export async function exportSpeakersCsv", "export async function exportSpeakerAssignmentsCsv");
  assert.equal(exportSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(exportSource.includes("where: { eventId }"), true);
  assert.equal(exportSource.includes("computeSpeakerReadinessFlags"), true);
  assert.equal(exportSource.includes('"Readiness"'), true);
});

test("assignment export is double event-scoped and includes session details", () => {
  const exportSource = exportServiceSource.slice(
    exportServiceSource.indexOf("export async function exportSpeakerAssignmentsCsv"),
  );
  assert.equal(exportSource.includes("session: { eventId }"), true);
  assert.equal(exportSource.includes("speaker: { eventId }"), true);
  for (const header of ['"Speaker"', '"Session"', '"Room"', '"Date"', '"Start"', '"End"']) {
    assert.equal(exportSource.includes(header), true, `assignments export missing header ${header}`);
  }
});

test("CSV escaping protects commas, quotes, and newlines", () => {
  const escapeSource = sourceBetween(exportServiceSource, "function csvEscape", "function toCsv");
  assert.equal(escapeSource.includes('replace(/"/g'), true);
  assert.equal(escapeSource.includes("[\",\\n\\r]"), true);
});

test("export route is authenticated and returns CSV attachments", () => {
  assert.equal(exportRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(exportRouteSource.includes("text/csv"), true);
  assert.equal(exportRouteSource.includes("attachment"), true);
  assert.equal(exportRouteSource.includes('exportType === "assignments"'), true);
});

test("directory exposes export actions", () => {
  assert.equal(directorySource.includes("Export Speakers"), true);
  assert.equal(directorySource.includes("Export Assignments"), true);
  assert.equal(directorySource.includes("/speakers/export?type=assignments"), true);
});
