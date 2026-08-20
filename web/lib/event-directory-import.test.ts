import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { parseCsv, type ParsedSheet } from "@/lib/import";
import {
  buildDirectoryDraftRows,
  buildDirectoryInitialMapping,
  parseDirectoryImportRow,
  splitFullName,
  type DirectoryImportDraftRow,
} from "./event-directory-import";

const directoryModalSource = readFileSync("app/(shell)/events/[eventId]/directory/_components/directory-import-modal.tsx", "utf8");

test("directory replacement uploads clear stale drafts and require a single readable sheet", () => {
  assert.ok(directoryModalSource.includes("setSheet(null);"));
  assert.ok(directoryModalSource.includes("setMapping({});"));
  assert.ok(directoryModalSource.includes("This workbook has multiple sheets."));
});

function draft(over: Partial<DirectoryImportDraftRow> = {}): DirectoryImportDraftRow {
  return { firstName: "", lastName: "", fullName: "", email: "", phone: "", company: "", title: "", ...over };
}

// --- header mapping --------------------------------------------------------

test("auto-maps common headers via synonyms", () => {
  const sheet: ParsedSheet = parseCsv("First Name,Last Name,Email,Company,Job Title\nJane,Doe,jane@acme.com,Acme,VP");
  const mapping = buildDirectoryInitialMapping(sheet.columns);
  assert.equal(mapping["0:First Name"], "firstName");
  assert.equal(mapping["1:Last Name"], "lastName");
  assert.equal(mapping["2:Email"], "email");
  assert.equal(mapping["3:Company"], "company");
  assert.equal(mapping["4:Job Title"], "title");
});

test("a single 'Name' column maps to fullName and is split", () => {
  const sheet: ParsedSheet = parseCsv("Name,Email\nJane Q Doe,jane@acme.com");
  const mapping = buildDirectoryInitialMapping(sheet.columns);
  assert.equal(mapping["0:Name"], "fullName");
  const { draftRows } = buildDirectoryDraftRows(sheet, mapping);
  const parsed = parseDirectoryImportRow(draftRows[0]);
  assert.equal(parsed.result, "ok");
  if (parsed.result === "ok") {
    assert.equal(parsed.parsed.firstName, "Jane");
    assert.equal(parsed.parsed.lastName, "Q Doe");
  }
});

test("splitFullName: first token is first name, remainder is last", () => {
  assert.deepEqual(splitFullName("Jane Doe"), { firstName: "Jane", lastName: "Doe" });
  assert.deepEqual(splitFullName("Cher"), { firstName: "Cher", lastName: null });
  assert.deepEqual(splitFullName("  "), { firstName: null, lastName: null });
});

// --- row parsing / validity ------------------------------------------------

test("normalizes email and derives display name", () => {
  const r = parseDirectoryImportRow(draft({ firstName: "Jane", lastName: "Doe", email: " Jane@ACME.com " }));
  assert.equal(r.result, "ok");
  if (r.result === "ok") {
    assert.equal(r.parsed.normalizedEmail, "jane@acme.com");
    assert.equal(r.parsed.displayName, "Jane Doe");
  }
});

test("row with neither email nor name is INVALID", () => {
  const r = parseDirectoryImportRow(draft({ company: "Acme" }));
  assert.equal(r.result, "invalid");
});

test("row with a name but no email is allowed (weaker identity)", () => {
  const r = parseDirectoryImportRow(draft({ fullName: "No Email Person", company: "Acme" }));
  assert.equal(r.result, "ok");
  if (r.result === "ok") assert.equal(r.parsed.normalizedEmail, null);
});

// --- service + route wiring (source assertions) ----------------------------

const service = readFileSync("src/server/services/event-directory.ts", "utf8");
const route = readFileSync("app/api/events/[eventId]/directory/imports/route.ts", "utf8");
const importLib = readFileSync("lib/event-directory-import.ts", "utf8");
const modal = readFileSync("app/(shell)/events/[eventId]/directory/_components/directory-import-modal.tsx", "utf8");

test("directory import modal only imports browser-safe parsing utilities", () => {
  assert.match(modal, /from "@\/lib\/event-directory-import"/);
  for (const forbidden of ["@/src/server", "@prisma/client", "@/lib/prisma", "pg"]) {
    assert.equal(modal.includes(forbidden), false, `directory import modal must not import ${forbidden}`);
    assert.equal(importLib.includes(forbidden), false, `event-directory-import lib must not import ${forbidden}`);
  }
  assert.match(importLib, /export function normalizeDirectoryEmail/);
  assert.match(service, /from "@\/lib\/event-directory-import"/);
  assert.match(route, /processDirectoryCsvImport/);
});

test("import endpoint exists and re-validates rows server-side, requiring source label + role", () => {
  assert.ok(existsSync("app/api/events/[eventId]/directory/imports/route.ts"));
  assert.match(route, /parseDirectoryImportRow\(draft\)/);
  assert.match(route, /sourceLabel is required/);
  assert.match(route, /targetRole is required/);
  assert.match(route, /processDirectoryCsvImport/);
});

test("processing matches by email (update), creates new, and flags name+company as DUPLICATE_REVIEW", () => {
  const start = service.indexOf("async function processImportRow");
  const body = service.slice(start, service.indexOf("async function recordImportRow", start));
  assert.match(body, /normalizedEmail: parsed\.normalizedEmail/);
  assert.match(body, /return "updated"/);
  assert.match(body, /dup\.matchType === "name_company"/);
  assert.match(body, /status = "DUPLICATE_REVIEW"/);
  assert.match(body, /\? "duplicateReview" : "created"/);
});

test("import adds the target role idempotently (skipDuplicates) and never deletes anyone", () => {
  const start = service.indexOf("async function ensureRole");
  const body = service.slice(start, start + 400);
  assert.match(body, /skipDuplicates: true/);
  assert.doesNotMatch(service.slice(service.indexOf("async function processImportRow")), /\.delete\(/);
});

test("import batch records totals and per-row results, and re-import updates by email", () => {
  const start = service.indexOf("export async function processDirectoryCsvImport");
  const body = service.slice(start, service.indexOf("export type ImportCounts"));
  assert.match(body, /eventDirectoryImportBatch\.create/);
  assert.match(body, /status: "COMPLETE"/);
  assert.match(body, /createdCount: counts\.created/);
});
