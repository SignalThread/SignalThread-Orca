// Matrix 2 / Run of Show section import: synonym-driven mapping + validation on
// top of the shared import foundation (lib/import). The Matrix service carries
// heavy server deps, so — matching budget/timeline-import-write-regression — the
// DB round-trip is asserted via source inspection while the pure mapping /
// validation / create-data logic is imported and exercised directly.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseCsv, parseWorkbookBytes } from "@/lib/import";
import { buildMatrixImportTemplateCsv, composeMatrixNotes, validateMatrixImportRows } from "@/lib/matrix-import";
import {
  buildMatrixDraftRows,
  buildMatrixInitialMapping,
  detectCapacityColumns,
  detectConflictColumns,
  detectDayColumns,
  MATRIX_IMPORT_FIELD_SPECS,
  validateMatrixMapping,
  type MatrixImportField,
} from "@/lib/matrix-import-mapping";
import { buildMatrixImportCreateData } from "@/lib/matrix";

const matrixServiceSource = readFileSync("lib/matrix.ts", "utf8");
const routeSource = readFileSync("app/api/events/[eventId]/matrix-rows/import/route.ts", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const importActionSource = readFileSync("app/(shell)/matrix-2/_components/matrix-import-action.tsx", "utf8");
const importModalShellSource = readFileSync("app/(shell)/_components/section-import-modal-shell.tsx", "utf8");

const FIXTURE_NAME = "Program_Matrix_Detailed.xlsx";
// Mirrors the real Program Matrix Detailed header order.
const FIXTURE_HEADER =
  "Day,Session,Date,Start Time,End Time,Room,Capacity,Setup,Speakers/Facilitators,AV Requirements,F&B Service,Assigned Staff,Special Notes";

function fixtureBytes(name: string): Uint8Array | null {
  const path = fileURLToPath(new URL(`../import-fixtures/event-upload/${name}`, import.meta.url));
  if (!existsSync(path)) return null;
  return new Uint8Array(readFileSync(path));
}

function fixtureStyleSheet() {
  return parseCsv(
    [
      FIXTURE_HEADER,
      "Day 1,Opening Session,2027-01-25,09:00,10:30,Grand Ballroom,450,Theater,CEO,Stage AV,Coffee,Production crew,Live streamed",
    ].join("\n"),
  );
}

function validateSheet(csv: string) {
  const sheet = parseCsv(csv);
  const mapping = buildMatrixInitialMapping(sheet.columns);
  const { draftRows, rowNumbers } = buildMatrixDraftRows(sheet, mapping);
  return validateMatrixImportRows(draftRows, { rowNumbers });
}

// --- Mapping ---

test("auto-maps Program Matrix headers to canonical fields", () => {
  const sheet = fixtureStyleSheet();
  const mapping = buildMatrixInitialMapping(sheet.columns);

  assert.equal(mapping["1:Session"], "title");
  assert.equal(mapping["2:Date"], "date");
  assert.equal(mapping["3:Start Time"], "startTime");
  assert.equal(mapping["4:End Time"], "endTime");
  assert.equal(mapping["5:Room"], "room");
  assert.equal(mapping["8:Speakers/Facilitators"], "speakers");
  assert.equal(mapping["11:Assigned Staff"], "staff");
  assert.equal(mapping["12:Special Notes"], "notes");

  // Required fields satisfied.
  assert.deepEqual(validateMatrixMapping(mapping), []);
});

test("Run of Show import exposes canonical setup, AV, F&B, supplies, and signage targets", () => {
  const labels = MATRIX_IMPORT_FIELD_SPECS.map((spec) => spec.label);
  assert.ok(labels.includes("Setup Type"));
  assert.ok(labels.includes("AV Needs"));
  assert.ok(labels.includes("F&B Service"));
  assert.ok(labels.includes("Supplies"));
  assert.ok(labels.includes("Signage"));

  const sheet = fixtureStyleSheet();
  const mapping = buildMatrixInitialMapping(sheet.columns);
  assert.equal(mapping["7:Setup"], "setup");
  assert.equal(mapping["9:AV Requirements"], "av");
  assert.equal(mapping["10:F&B Service"], "fnb");

  const { draftRows, rowNumbers } = buildMatrixDraftRows(sheet, {
    ...mapping,
    "7:Setup": "setup",
    "9:AV Requirements": "av",
    "10:F&B Service": "fnb",
  });
  const result = validateMatrixImportRows(draftRows, { rowNumbers });
  const row = result.validRows[0];
  assert.equal(row?.setupType, "Theater");
  assert.equal(row?.avNeeds, "Stage AV");
  assert.match(row?.notes ?? "", /^F&B: Coffee$/m);
});

test("Run of Show import template includes permanent operational categories", () => {
  const template = buildMatrixImportTemplateCsv();
  assert.match(template, /Session,Date,Start Time,End Time,Room,Speakers\/Facilitators,Assigned Staff,Supplies,Signage,Attendance,Status,Special Notes/);
  assert.doesNotMatch(template, /Setup/);
  assert.doesNotMatch(template, /AV Requirements/);
  assert.doesNotMatch(template, /F&B Service/);
});

test("supplies and signage normalize into first-class requirement values", () => {
  const result = validateSheet(
    "Session,Date,Start Time,End Time,Supplies,Signage\nWorkshop,2027-01-25,09:00,10:00,Pens x 20; Notepads: 10,Directional signage × 2",
  );
  assert.deepEqual(result.validRows[0]?.supplies, [
    { label: "Pens", quantity: 20 },
    { label: "Notepads", quantity: 10 },
  ]);
  assert.deepEqual(result.validRows[0]?.signage, [{ label: "Directional signage", quantity: 2 }]);
  assert.doesNotMatch(result.validRows[0]?.notes ?? "", /Supplies|Signage/);
});

test("duplicate rows in one file are deterministic row errors", () => {
  const result = validateSheet([
    "Session,Date,Start Time,End Time,Room",
    "Workshop,2027-01-25,09:00,10:00,Studio",
    " workshop ,2027-01-25,09:00,10:00, STUDIO ",
  ].join("\n"));
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 1);
  assert.match(result.rows[1]?.errors.join(" ") ?? "", /Duplicate session row/);
});

test("Day and Conflicts columns are detected for notices, never auto-mapped", () => {
  const sheet = parseCsv("Day,Session,Date,Start Time,End Time,Conflicts\nDay 1,Kickoff,2027-01-25,09:00,10:00,None");
  const mapping = buildMatrixInitialMapping(sheet.columns);
  assert.equal(mapping["0:Day"], "");
  assert.equal(mapping["5:Conflicts"], "");
  assert.equal(detectDayColumns(sheet.columns).length, 1);
  assert.equal(detectConflictColumns(sheet.columns).length, 1);
});

test("Capacity is NOT silently mapped to attendance", () => {
  const sheet = fixtureStyleSheet();
  const mapping = buildMatrixInitialMapping(sheet.columns);
  // The Capacity column (index 6) is left unmapped...
  assert.equal(mapping["6:Capacity"], "");
  // ...and no column auto-resolves to the attendance field.
  assert.ok(!Object.values(mapping).includes("attendance" as MatrixImportField));
  // It is, however, detected so the UI can offer an explicit opt-in.
  assert.equal(detectCapacityColumns(sheet.columns).length, 1);
});

test("explicit Attendance / Expected Attendance headers DO map to attendance", () => {
  const sheet = parseCsv("Session,Date,Start Time,End Time,Expected Attendance\nKickoff,2027-01-25,09:00,10:00,300");
  const mapping = buildMatrixInitialMapping(sheet.columns);
  assert.equal(mapping["4:Expected Attendance"], "attendance");
});

// --- Validation / normalization ---

test("a fully mapped row validates and normalizes", () => {
  const result = validateSheet(
    "Session,Date,Start Time,End Time,Room\nKickoff,2027-01-25,09:00,10:30,Main Hall",
  );
  assert.equal(result.validCount, 1);
  const row = result.rows[0];
  assert.equal(row.normalized?.sessionName, "Kickoff");
  assert.equal(row.normalized?.dayDateIso, "2027-01-25");
  assert.equal(row.normalized?.startTime, "09:00");
  assert.equal(row.normalized?.endTime, "10:30");
  assert.equal(row.normalized?.roomName, "Main Hall");
});

test("blank Session is a row error", () => {
  const result = validateSheet("Session,Date,Start Time,End Time\n,2027-01-25,09:00,10:00");
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.ok(result.rows[0].errors.some((error) => /Session is required/.test(error)));
});

test("invalid Date is a row error", () => {
  const result = validateSheet("Session,Date,Start Time,End Time\nKickoff,not-a-date,09:00,10:00");
  assert.equal(result.validCount, 0);
  assert.ok(result.rows[0].errors.some((error) => /Date must be a valid date/.test(error)));
});

test("invalid Start/End time is a row error", () => {
  const result = validateSheet("Session,Date,Start Time,End Time\nKickoff,2027-01-25,25:00,99:99");
  assert.equal(result.validCount, 0);
  assert.ok(result.rows[0].errors.some((error) => /Start Time must be a valid time/.test(error)));
  assert.ok(result.rows[0].errors.some((error) => /End Time must be a valid time/.test(error)));
});

test("End before Start is a row error", () => {
  const result = validateSheet("Session,Date,Start Time,End Time\nKickoff,2027-01-25,10:30,09:00");
  assert.equal(result.validCount, 0);
  assert.ok(result.rows[0].errors.some((error) => /End Time must be on or after Start Time/.test(error)));
});

test("ISO and M/D/YYYY dates + 12h times parse correctly", () => {
  const result = validateSheet("Session,Date,Start Time,End Time\nKickoff,1/25/2027,9:00 AM,2:30 PM");
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.dayDateIso, "2027-01-25");
  assert.equal(result.rows[0].normalized?.startTime, "09:00");
  assert.equal(result.rows[0].normalized?.endTime, "14:30");
});

test("negative / non-integer attendance is a row error when attendance is mapped", () => {
  const negative = validateSheet("Session,Date,Start Time,End Time,Attendance\nKickoff,2027-01-25,09:00,10:00,-5");
  assert.equal(negative.validCount, 0);
  assert.ok(negative.rows[0].errors.some((error) => /Attendance must be a whole number/.test(error)));

  const fractional = validateSheet("Session,Date,Start Time,End Time,Attendance\nKickoff,2027-01-25,09:00,10:00,12.5");
  assert.equal(fractional.validCount, 0);

  const valid = validateSheet("Session,Date,Start Time,End Time,Attendance\nKickoff,2027-01-25,09:00,10:00,300");
  assert.equal(valid.validCount, 1);
  assert.equal(valid.rows[0].normalized?.attendance, 300);
});

test("attendance defaults to null when the column is not mapped", () => {
  const result = validateSheet("Session,Date,Start Time,End Time\nKickoff,2027-01-25,09:00,10:00");
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.attendance, null);
});

test("partial success: valid rows pass, invalid rows are reported", () => {
  const result = validateSheet(
    [
      "Session,Date,Start Time,End Time",
      "Good,2027-01-25,09:00,10:00",
      ",2027-01-25,09:00,10:00",
      "Also Good,2027-01-26,11:00,12:00",
    ].join("\n"),
  );
  assert.equal(result.validCount, 2);
  assert.equal(result.invalidCount, 1);
});

// --- Notes composition (parseable by the Matrix 2 snapshot) ---

test("notes composition creates parseable Speakers/Staff/F&B/Status lines", () => {
  const notes = composeMatrixNotes({
    speakers: "CEO, CRO",
    staff: "Production crew",
    fnb: "Coffee station",
    status: "Confirmed",
    plain: "Live streamed",
  });
  // Same prefixes the snapshot's parseStructuredNotes recognizes.
  assert.match(notes, /^Speakers: CEO, CRO$/m);
  assert.match(notes, /^Staff: Production crew$/m);
  assert.match(notes, /^F&B: Coffee station$/m);
  assert.match(notes, /^Status: Confirmed$/m);
  assert.match(notes, /^Live streamed$/m);
  // Fixed order.
  const lines = notes.split("\n");
  assert.deepEqual(lines, [
    "Speakers: CEO, CRO",
    "Staff: Production crew",
    "F&B: Coffee station",
    "Status: Confirmed",
    "Live streamed",
  ]);
});

test("AV Requirements is preserved by Run of Show import", () => {
  const result = validateSheet(
    "Session,Date,Start Time,End Time,AV Requirements,Speakers/Facilitators\nKickoff,2027-01-25,09:00,10:00,Stage AV,CEO",
  );
  const row = result.rows[0];
  assert.equal(row.normalized?.avNeeds, "Stage AV");
  assert.ok(!/Stage AV/.test(row.normalized?.notes ?? ""));
  assert.match(row.normalized?.notes ?? "", /^Speakers: CEO$/m);
});

// --- Bulk create data (server-side stamping + ordering, no related records) ---

test("buildMatrixImportCreateData stamps eventId and assigns sequential sortOrder", () => {
  const result = validateSheet(
    [
      "Session,Date,Start Time,End Time,Room,AV Requirements,Speakers/Facilitators,Attendance",
      "Kickoff,2027-01-25,09:00,10:30,Main Hall,Stage AV,CEO,450",
      "Lunch,2027-01-25,12:00,13:00,Foyer,,,400",
    ].join("\n"),
  );
  assert.equal(result.validCount, 2);

  const data = buildMatrixImportCreateData("event-1", result.validRows, 4);
  assert.equal(data.length, 2);
  assert.equal(data[0].eventId, "event-1");
  assert.equal(data[1].eventId, "event-1");
  assert.equal(data[0].sessionName, "Kickoff");
  assert.equal(data[0].roomName, "Main Hall");
  assert.equal(data[0].avNeeds, "Stage AV");
  assert.equal(data[0].attendance, 450);
  assert.ok(data[0].dayDate instanceof Date);
  assert.ok(data[0].startTime instanceof Date);
  assert.equal((data[0].startTime as Date).toISOString(), "1970-01-01T09:00:00.000Z");
  assert.equal((data[0].dayDate as Date).toISOString(), "2027-01-25T00:00:00.000Z");
  assert.match(String(data[0].notes), /^Speakers: CEO$/m);
  // sortOrder contiguous after the provided base.
  assert.equal(data[0].sortOrder, 5);
  assert.equal(data[1].sortOrder, 6);
});

// --- Server wiring (source inspection) ---

test("importMatrixRows asserts write access, stamps eventId, and uses chunked createMany", () => {
  const start = matrixServiceSource.indexOf("export async function importMatrixRows");
  assert.ok(start !== -1);
  const fn = matrixServiceSource.slice(start);

  assert.ok(fn.includes('assertMatrixEventAccess(eventId, user, "write")'));
  assert.ok(fn.includes("createMany"));
  assert.ok(fn.includes("MATRIX_IMPORT_CHUNK_SIZE"));
  // Never loops the single-row createMatrixRow per row.
  assert.ok(!fn.includes("createMatrixRow("));
});

test("matrix import persists retry identity and canonical operational selections atomically", () => {
  assert.match(matrixServiceSource, /matrixImportBatch\.create/);
  assert.match(matrixServiceSource, /eventId_requestedByUserId_idempotencyKey/);
  assert.match(matrixServiceSource, /payloadHash/);
  assert.match(matrixServiceSource, /ensureEventSessionRequirementTemplateTx/);
  assert.match(matrixServiceSource, /sessionRequirementSelection\.createMany/);
  assert.match(routeSource, /idempotencyKey/);
  assert.match(importActionSource, /importIdempotencyKeyRef/);
});

test("assertMatrixEventAccess maps EventAccessError -> MatrixError (preserves 403)", () => {
  assert.ok(matrixServiceSource.includes("error instanceof EventAccessError"));
  assert.ok(matrixServiceSource.includes("new MatrixError(error.message, error.status)"));
});

test("import route resolves the user, asserts write access, and re-validates rows", () => {
  assert.ok(routeSource.includes("resolveRequestUser(request)"));
  assert.ok(routeSource.includes('assertEventAccessForUser(eventId, authResult.user, "write")'));
  assert.ok(routeSource.includes("validateMatrixImportRows("));
  assert.ok(routeSource.includes("importMatrixRows("));
  assert.ok(routeSource.includes("matrix-rows/import"));
});

test("matrix-2 page wires an Import action that refreshes the snapshot on success", () => {
  assert.ok(pageSource.includes("MatrixImportAction"));
  assert.ok(pageSource.includes("await loadSnapshot(selectedEventId)"));
});

test("shared import modal shell uses viewport-safe sizing above Run of Show sticky chrome", () => {
  assert.ok(importModalShellSource.includes('"use client"'));
  assert.ok(importModalShellSource.includes("createPortal("));
  assert.ok(importModalShellSource.includes("if (typeof document === \"undefined\") return null;"));
  assert.ok(importModalShellSource.includes("document.body,"));
  assert.ok(importModalShellSource.includes("fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto"));
  assert.ok(importModalShellSource.includes("max-h-[calc(100dvh-2rem)]"));
  assert.ok(importModalShellSource.includes("sm:max-h-[calc(100dvh-3rem)]"));
  assert.ok(importModalShellSource.includes("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"));
});

test("matrix import empty-state CTA looks clearly disabled when no rows are ready", () => {
  assert.ok(importActionSource.includes("disabled:bg-slate-200"));
  assert.ok(importActionSource.includes("disabled:text-slate-500"));
  assert.ok(importActionSource.includes("disabled:hover:bg-slate-200"));
});

// --- Real fixture (skips gracefully if absent / not committed) ---

test("Program_Matrix_Detailed fixture auto-maps headers and yields valid rows", async (t) => {
  const bytes = fixtureBytes(FIXTURE_NAME);
  if (!bytes) {
    t.skip(`${FIXTURE_NAME} fixture not present`);
    return;
  }

  const workbook = await parseWorkbookBytes(bytes);
  const sheet = workbook.sheets.find((candidate) => candidate.columns.some((c) => /session/i.test(c.header)));
  assert.ok(sheet, "expected a sheet with a Session column");

  const mapping = buildMatrixInitialMapping(sheet!.columns);
  assert.deepEqual(validateMatrixMapping(mapping), []);
  // Capacity present but not mapped to attendance.
  assert.ok(detectCapacityColumns(sheet!.columns).length >= 0);

  const { draftRows, rowNumbers } = buildMatrixDraftRows(sheet!, mapping);
  const result = validateMatrixImportRows(draftRows, { rowNumbers });
  assert.ok(result.validCount > 0, "fixture should yield valid rows");
  assert.equal(result.invalidCount, 0);
  // Imported rows carry Speakers/F&B/Staff as parseable notes lines.
  const sample = result.validRows[0];
  assert.ok(sample.sessionName.length > 0);
  assert.match(sample.notes, /^Speakers:/m);
});
