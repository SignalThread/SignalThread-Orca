// Timeline section-level import: synonym-driven mapping + validation on top of
// the shared import foundation (lib/import). The Timeline service carries heavy
// server deps, so — matching budget-import-write-regression — the DB round-trip
// is asserted via source inspection while the pure mapping/validation/create-data
// logic is imported and exercised directly.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseCsv, parseWorkbookBytes } from "@/lib/import";
import {
  buildTimelineDraftRows,
  buildTimelineInitialMapping,
  detectMonthColumns,
  detectResponsiblePartyColumns,
  validateTimelineMapping,
  type TimelineImportField,
} from "@/lib/timeline-import-mapping";
import {
  buildTimelineImportTemplateCsv,
  buildTimelineImportSuccessOutcome,
  validateTimelineImportRows,
} from "@/lib/timeline-import";
import { buildTimelineImportCreateData } from "@/src/server/services/timeline";

const serviceSource = readFileSync("src/server/services/timeline.ts", "utf8");
const routeSource = readFileSync("app/api/events/[eventId]/timeline-items/import/route.ts", "utf8");
const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");

const FIXTURE_NAME = "Detailed_Timeline.xlsx";
// Mirrors the real Detailed_Timeline header order.
const FIXTURE_HEADER = "Month,Task,Due Date,Responsible Party,Status";

function fixtureBytes(name: string): Uint8Array | null {
  const path = fileURLToPath(new URL(`../import-fixtures/event-upload/${name}`, import.meta.url));
  if (!existsSync(path)) return null;
  return new Uint8Array(readFileSync(path));
}

function fixtureStyleSheet() {
  return parseCsv(
    [
      FIXTURE_HEADER,
      "July 2026,Event Kickoff,2026-07-15,Event Manager,Not Started",
      "August 2026,Venue Walkthrough,8/3/2026,Procurement,In Progress",
    ].join("\n"),
  );
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

// --- Mapping ---

test("auto-maps fixture headers while Month stays ignored and Responsible Party maps to owner", () => {
  const sheet = fixtureStyleSheet();
  const mapping = buildTimelineInitialMapping(sheet.columns);

  assert.equal(mapping["0:Month"], "");
  assert.equal(mapping["1:Task"], "title");
  assert.equal(mapping["2:Due Date"], "endDate");
  assert.equal(mapping["3:Responsible Party"], "owner");
  assert.equal(mapping["4:Status"], "status");

  // Month stays ignored; Responsible Party is an owner target.
  assert.equal(detectMonthColumns(sheet.columns).length, 1);
  assert.equal(detectResponsiblePartyColumns(sheet.columns).length, 1);
  assert.ok(Object.values(mapping).includes("title" as TimelineImportField));
  // The required Item field is satisfied.
  assert.deepEqual(validateTimelineMapping(mapping), []);
});

test("Month stays ignored even if a Due Date column is present", () => {
  const sheet = parseCsv("Month,Task,Due Date\nJuly 2026,Kickoff,2026-07-15");
  const mapping = buildTimelineInitialMapping(sheet.columns);
  assert.equal(mapping["0:Month"], "");
  assert.equal(mapping["2:Due Date"], "endDate");
});

test("Responsible Party maps to Owner for event-scoped matching", () => {
  const sheet = parseCsv("Task,Due Date,Responsible Party\nKickoff,2026-07-15,Event Manager");
  const mapping = buildTimelineInitialMapping(sheet.columns);
  assert.equal(mapping["2:Responsible Party"], "owner");
  assert.equal(detectResponsiblePartyColumns(sheet.columns).length, 1);
});

test("mapping requires an item column but not a date column", () => {
  // No Task column -> required title unmapped -> mapping error.
  const sheet = parseCsv("Due Date,Status\n2026-07-15,Not Started");
  const mapping = buildTimelineInitialMapping(sheet.columns);
  assert.ok(validateTimelineMapping(mapping).length > 0);
  assert.deepEqual(validateTimelineMapping(buildTimelineInitialMapping(parseCsv("Task\nKickoff").columns)), []);
});

// --- Validation / normalization ---

function validateSheet(csv: string) {
  const sheet = parseCsv(csv);
  const mapping = buildTimelineInitialMapping(sheet.columns);
  const { draftRows, rowNumbers } = buildTimelineDraftRows(sheet, mapping);
  return validateTimelineImportRows(draftRows, { rowNumbers });
}

test('"Not Started" normalizes to NOT_STARTED', () => {
  const result = validateSheet("Task,Due Date,Status\nKickoff,2026-07-15,Not Started");
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.status, "NOT_STARTED");
});

test("blank Status defaults to NOT_STARTED", () => {
  const result = validateSheet("Task,Due Date,Status\nKickoff,2026-07-15,");
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.status, "NOT_STARTED");
});

test("template csv includes canonical timeline import headers", () => {
  const csv = buildTimelineImportTemplateCsv();
  assert.match(csv, /^Item,Workstream,Planning Stage,Status,Priority,Start Date,End Date,Critical Path,Owner,Notes/m);
  assert.equal(csv.includes("Responsible Party"), false);
  assert.match(csv, /Launch registration page/);
});

test("source notes auto-map, preview-normalize, and remain optional", () => {
  const withNotes = validateSheet(
    "Task,Due Date,Comments\nConfirm venue,2026-07-15,Keep the venue hold until the contract is signed",
  );
  assert.equal(withNotes.validCount, 1);
  assert.equal(withNotes.rows[0].normalized?.notes, "Keep the venue hold until the contract is signed");

  const blankNotes = validateSheet("Task,Due Date,Notes\nConfirm venue,2026-07-15,");
  assert.equal(blankNotes.validCount, 1);
  assert.equal(blankNotes.rows[0].normalized?.notes, null);
});

test("unknown Status is a row error", () => {
  const result = validateSheet("Task,Due Date,Status\nKickoff,2026-07-15,Blocked");
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.ok(result.rows[0].errors.some((error) => /Status must be one of/.test(error)));
});

test("ISO and M/D/YYYY due dates parse to ISO", () => {
  const result = validateSheet(
    "Task,Due Date,Status\nKickoff,2026-07-15,Not Started\nWalkthrough,8/3/2026,In Progress",
  );
  assert.equal(result.validCount, 2);
  assert.equal(result.rows[0].normalized?.startDateIso, "2026-07-15");
  assert.equal(result.rows[0].normalized?.endDateIso, "2026-07-15");
  assert.equal(result.rows[1].normalized?.endDateIso, "2026-08-03");
});

test("CSV import preserves the exact selected start and due calendar dates", () => {
  const result = validateSheet(
    "Item,Start Date,End Date\nTimezone-safe roadmap date,2026-09-17,2026-09-17",
  );
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.startDateIso, "2026-09-17");
  assert.equal(result.rows[0].normalized?.endDateIso, "2026-09-17");
});

test("roadmap list columns import into TimelineItem fields", () => {
  const result = validateSheet(
    "Item,Workstream,Planning Stage,Status,Priority,Start Date,End Date,Critical Path\nConfirm caterer,F&B,Build,In Progress,High,2026-07-01,2026-07-05,Yes",
  );
  assert.equal(result.validCount, 1);
  const row = result.rows[0].normalized;
  assert.equal(row?.title, "Confirm caterer");
  assert.equal(row?.workstream, "FNB");
  assert.equal(row?.planningStage, "BUILD");
  assert.equal(row?.status, "IN_PROGRESS");
  assert.equal(row?.priority, "HIGH");
  assert.equal(row?.startDateIso, "2026-07-01");
  assert.equal(row?.endDateIso, "2026-07-05");
  assert.equal(row?.isCriticalPath, true);
});

test("imports map normalized workstream names even when that workstream has no existing items", () => {
  const result = validateSheet(
    "Item,Workstream,End Date\nPrepare attendee desks,  registration  ,2026-07-05",
  );

  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.workstream, "REGISTRATION");
  assert.deepEqual(result.rows[0].warnings, []);
});

test("unknown imported workstream values are rejected for explicit review", () => {
  const result = validateSheet(
    "Item,Workstream,End Date\nPlan VIP lounge, VIP Services ,2026-07-05",
  );

  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.ok(result.rows[0].errors.some((error) => /Workstream.*VIP Services.*not supported/i.test(error)));
});

test("unknown taxonomy is rejected while an unmatched owner remains explicit", () => {
  const result = validateTimelineImportRows(
    [{
      Item: "Plan VIP lounge",
      Workstream: "VIP Services",
      "Planning Stage": "QA",
      Status: "",
      Priority: "",
      "Start Date": "",
      "End Date": "2026-07-05",
      "Critical Path": "",
      Owner: "Alex Unknown",
    }],
    { ownerOptions: [{ id: "owner-1", name: "Known Owner", email: "known@example.com" }] },
  );

  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.match(result.rows[0].errors.join(" "), /Stage.*QA.*not supported/i);
  assert.match(result.rows[0].warnings.join(" "), /Owner.*Alex Unknown.*not found.*unassigned/i);
});

test("a taxonomy-heavy upload reports every unsupported assignment instead of discarding it", () => {
  const rows = Array.from({ length: 88 }, (_, index) => ({
    Item: `Imported roadmap item ${index + 1}`,
    Workstream: `Spreadsheet workstream ${index + 1}`,
    "Planning Stage": `Spreadsheet stage ${index + 1}`,
    Status: "",
    Priority: "",
    "Start Date": "",
    "End Date": "2026-07-05",
    "Critical Path": "",
    Owner: "",
  }));
  const result = validateTimelineImportRows(rows);
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 88);
  assert.equal(result.rows.filter((row) => row.errors.length > 0).length, 88);
});

test("known owner matches by event-user name or email without creating a user", () => {
  const result = validateTimelineImportRows(
    [{
      Item: "Kickoff",
      Workstream: "",
      "Planning Stage": "",
      Status: "",
      Priority: "",
      "Start Date": "",
      "End Date": "2026-07-15",
      "Critical Path": "",
      Owner: "owner@example.com",
    }],
    { ownerOptions: [{ id: "owner-1", name: "Alex", email: "owner@example.com" }] },
  );
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.ownerUserId, "owner-1");
  assert.equal(result.rows[0].warnings.length, 0);
});

test("blank dates are allowed when the item name is present", () => {
  const result = validateSheet("Task,Due Date,Status\nKickoff,,Not Started");
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 0);
  assert.equal(result.rows[0].normalized?.endDateIso, null);
});

test("invalid Due Date is a row error (skipped)", () => {
  const result = validateSheet("Task,Due Date,Status\nKickoff,not-a-date,Not Started");
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.ok(result.rows[0].errors.some((error) => /valid date/.test(error)));
});

test("blank Task is a row error (skipped)", () => {
  const result = validateSheet("Task,Due Date,Status\n,2026-07-15,Not Started");
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.ok(result.rows[0].errors.some((error) => /Item is required/.test(error)));
});

test("owner source is retained when event users are not available during preview", () => {
  const result = validateSheet("Task,Due Date,Responsible Party\nKickoff,2026-07-15,Event Manager");
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].normalized?.ownerUserId, null);
  assert.equal(result.rows[0].normalized?.ownerSource, "Event Manager");
  assert.equal(result.rows[0].warnings.length, 0);
});

test("fully blank rows are dropped before validation (not counted invalid)", () => {
  const sheet = parseCsv("Task,Due Date,Status\nKickoff,2026-07-15,Not Started\n,,\nWrap,2026-08-01,");
  const mapping = buildTimelineInitialMapping(sheet.columns);
  const { draftRows, rowNumbers } = buildTimelineDraftRows(sheet, mapping);
  // The fully blank middle row is excluded by buildMappedRows before validation.
  assert.equal(draftRows.length, 2);
  const result = validateTimelineImportRows(draftRows, { rowNumbers });
  assert.equal(result.validCount, 2);
  assert.equal(result.invalidCount, 0);
});

test("warningCount counts only row-level warnings, not top-level notices", () => {
  const result = validateSheet("Task,Due Date,Month\nKickoff,2026-07-15,July 2026");
  assert.equal(result.warningCount, 0);
});

// --- Create data: milestone startDate === endDate, eventId stamped, ordered ---

test("Due Date imports as a milestone (startDate === endDate) with stamped eventId", () => {
  const result = validateSheet(
    "Task,Due Date,Status\nKickoff,2026-07-15,Not Started\nWalkthrough,2026-08-03,Complete",
  );
  const data = buildTimelineImportCreateData("event-1", result.validRows, 4);

  assert.equal(data.length, 2);
  assert.equal(data[0].eventId, "event-1");
  assert.equal(data[0].title, "Kickoff");
  assert.equal(data[0].status, "NOT_STARTED");
  assert.equal(data[0].priority, "MEDIUM");
  // Milestone: startDate and endDate are the same day.
  assert.ok(data[0].startDate instanceof Date);
  assert.equal((data[0].startDate as Date).getTime(), (data[0].endDate as Date).getTime());
  assert.equal((data[0].startDate as Date).toISOString(), "2026-07-15T00:00:00.000Z");
  // sortOrder is contiguous after the provided base.
  assert.equal(data[0].sortOrder, 5);
  assert.equal(data[1].sortOrder, 6);
  assert.equal(data[1].status, "COMPLETE");
});

// --- Selected sheet only ---

test("draft rows come only from the selected sheet (selection is per-sheet)", () => {
  const selected = parseCsv("Task,Due Date,Status\nKickoff,2026-07-15,Not Started\nWrap,2026-08-01,Complete");
  const other = parseCsv("Task,Due Date,Status\nOther A,2026-09-01,Not Started\nOther B,2026-09-02,Complete");

  const mapping = buildTimelineInitialMapping(selected.columns);
  const { draftRows } = buildTimelineDraftRows(selected, mapping);

  assert.equal(draftRows.length, 2);
  const blob = JSON.stringify(draftRows);
  assert.ok(!/Other A|Other B/.test(blob), "other sheet content must not appear");
  void other;
});

// --- Success outcome ---

test("success outcome always closes the modal and reports counts", () => {
  const ok = buildTimelineImportSuccessOutcome({ importedCount: 5, skippedCount: 0, hasOtherSheets: false });
  assert.equal(ok.closeModal, true);
  assert.match(ok.noticeDetail, /Imported 5 timeline items/);

  const partial = buildTimelineImportSuccessOutcome({ importedCount: 160, skippedCount: 8, hasOtherSheets: false });
  assert.match(partial.noticeDetail, /skipped 8 invalid rows/);

  const multi = buildTimelineImportSuccessOutcome({ importedCount: 3, skippedCount: 0, hasOtherSheets: true });
  assert.match(multi.noticeDetail, /Only the selected sheet was imported/);
});

// --- Real fixture (skips gracefully if absent / not committed) ---

test("Detailed_Timeline fixture auto-maps headers and yields 168 import rows", async (t) => {
  const bytes = fixtureBytes(FIXTURE_NAME);
  if (!bytes) {
    t.skip(`${FIXTURE_NAME} fixture not present`);
    return;
  }

  const workbook = await parseWorkbookBytes(bytes);
  assert.equal(workbook.sheets.length, 1, "fixture is single-sheet");
  const sheet = workbook.sheets[0];
  assert.deepEqual(sheet.columns.map((column) => column.header), [
    "Month",
    "Task",
    "Due Date",
    "Responsible Party",
    "Status",
  ]);

  const mapping = buildTimelineInitialMapping(sheet.columns);
  assert.deepEqual(validateTimelineMapping(mapping), []);
  assert.equal(detectMonthColumns(sheet.columns).length, 1);
  assert.equal(detectResponsiblePartyColumns(sheet.columns).length, 1);
  assert.equal(mapping["3:Responsible Party"], "owner");

  const { draftRows, rowNumbers } = buildTimelineDraftRows(sheet, mapping);
  const result = validateTimelineImportRows(draftRows, { rowNumbers });
  // 168 data rows in the fixture; all valid (ISO dates, known statuses).
  assert.equal(draftRows.length, 168);
  assert.equal(result.validCount, 168);
  assert.equal(result.invalidCount, 0);
  assert.equal(result.rows[0].normalized?.status, "NOT_STARTED");
});

// --- Server wiring (source inspection) ---

test("import service asserts write access, stamps eventId, and uses chunked createMany", () => {
  const start = serviceSource.indexOf("export async function importTimelineItems");
  const end = serviceSource.indexOf("export async function updateTimelineItem");
  assert.ok(start !== -1 && end !== -1);
  const fn = serviceSource.slice(start, end);

  assert.ok(fn.includes('assertTimelineEventAccess(eventId, user, "write")'));
  assert.ok(fn.includes("createMany"));
  assert.ok(fn.includes("TIMELINE_IMPORT_CHUNK_SIZE"));
  assert.ok(fn.includes("timelineImportBatch"));
  assert.ok(fn.includes("payloadHash"));
  // No per-row create() loop over the input rows.
  assert.ok(!/inputRows\.map\([^)]*\.create\(/.test(fn), "no per-row create()");
  // eventId is stamped server-side in the create-data builder.
  assert.ok(serviceSource.includes("eventId,\n      title,"));
  assert.ok(serviceSource.includes("notes: row.notes?.trim() || null"));
});

test("import route resolves the user and server-side re-validates rows", () => {
  assert.ok(routeSource.includes("resolveRequestUser(request)"));
  assert.ok(routeSource.includes("validateTimelineImportRows("));
  assert.ok(routeSource.includes("importTimelineItems("));
  // Structured summary response.
  assert.ok(routeSource.includes("importedCount"));
  assert.ok(routeSource.includes("listEventAssignableUsers(eventId)"));
  assert.ok(routeSource.includes("missingAssignmentsCount"));
  assert.ok(routeSource.includes("Notes: String(item.Notes"));
  assert.ok(routeSource.includes("idempotencyKey"));
});

test("timeline page wires an Import action and posts only the selected-sheet rows", () => {
  assert.ok(pageSource.includes("onClick={() => openImportModal()}"));
  assert.ok(pageSource.includes("/timeline-items/import`"));
  assert.ok(pageSource.includes("idempotencyKey: importIdempotencyKey"));
  // Top-level notices (not per-row warnings).
  assert.ok(pageSource.includes("unmatched values import unassigned with a warning."));
  assert.ok(pageSource.includes("Month is derived from the date and won&apos;t be imported."));
});

test("Roadmap preview distinguishes warning-ready rows and exposes Needs assignment", () => {
  const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
  assert.ok(pageSource.includes("Ready with warnings"));
  assert.ok(pageSource.includes("warningImportCount"));
  assert.ok(listSource.includes("Needs assignment"));
  assert.ok(listSource.includes("filters.needsAssignment"));
});

test("timeline import action is placed in the page action area, not the crowded filter row", () => {
  const headerSource = sourceBetween(pageSource, "<EventModuleHeader", '<div className={`${eventModuleClasses.controlRow}');
  const filterRowSource = sourceBetween(pageSource, '<div className={`${eventModuleClasses.controlRow}', "{errorMessage ? <p");
  const importIndex = headerSource.indexOf("onClick={() => openImportModal()}");
  const addIndex = headerSource.indexOf("Add item");
  const filterIndex = filterRowSource.indexOf('aria-label="Filter by workstream"');
  assert.ok(importIndex !== -1, "Import action should render in the page header actions");
  assert.ok(addIndex !== -1, "Add item action should render in the page header actions");
  assert.ok(filterIndex !== -1, "filter toolbar should still render roadmap filters");
  assert.equal(filterRowSource.includes("onClick={() => openImportModal()}"), false, "Import action should not render in the filter toolbar");
  assert.ok(pageSource.includes("actions={"));
});

test("Import action is visually gated by canEdit (hidden for read-only users)", () => {
  // The Import button is rendered only inside a `{canEdit ? (...)` gate, so a
  // read-only user never sees it. Server-side write enforcement is unchanged.
  const headerSource = sourceBetween(pageSource, "<EventModuleHeader", '<div className={`${eventModuleClasses.controlRow}');
  const gateIndex = headerSource.indexOf("{canEdit ? (");
  const importIndex = headerSource.indexOf("onClick={() => openImportModal()}");
  assert.ok(gateIndex !== -1, "expected a {canEdit ? (...) gate");
  assert.ok(importIndex > gateIndex, "Import button must be inside the canEdit gate");
});

test("timeline import empty state stays compact until a file is selected", () => {
  assert.ok(pageSource.includes("compact={!hasImportFileSelection}"));
  assert.ok(pageSource.includes("Download Template"));
  assert.ok(pageSource.includes("Choose File"));
  assert.ok(pageSource.includes("!hasImportFileSelection ? ("));
  const emptyState = sourceBetween(pageSource, "!hasImportFileSelection ? (", ") : (");
  assert.ok(!emptyState.includes("Rows</p>"));
  assert.ok(!emptyState.includes("<table"));
});
