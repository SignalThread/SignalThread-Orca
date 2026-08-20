import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, type ParsedSheet, type ParsedWorkbook } from "@/lib/import";
import {
  buildInitialWorkbookSheetSelections,
  buildBudgetPreview,
  buildRunOfShowPreview,
  buildTimelinePreview,
  buildWorkbookCreatePlan,
  buildWorkbookSourcesCreatePlan,
  createImportPreviewFromWorkbook,
  createImportPreviewFromWorkbookSources,
  detectWorkbookSheets,
  type WorkbookSheetSelections,
  workbookSourceSheetName,
} from "./event-import-builder";
import { summarizeEventImportPreview, type EventImportBasics } from "./event-import-types";

const basics: EventImportBasics = {
  name: "Conf",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  timezone: "America/New_York",
};

function sheet(name: string, csv: string): ParsedSheet {
  return { ...parseCsv(csv), name };
}

function workbook(sheets: ParsedSheet[]): ParsedWorkbook {
  return { sheetNames: sheets.map((s) => s.name), sheets };
}

const ROS_CSV = [
  "Session,Date,Start Time,End Time,Room",
  "Opening Remarks,2026-09-01,09:00,09:30,Main Ballroom",
  "Keynote,2026-09-01,9:30 AM,10:30 AM,Main Ballroom",
  "Breakout,2026-09-01,11:00,12:00,Room 204",
  ",2026-09-01,13:00,14:00,Room 204", // missing title -> skipped
].join("\n");

const BUDGET_CSV = [
  "Category,Line Item,Estimated Cost",
  "Venue,Ballroom rental,4500",
  "AV,Stage + LED,1200",
  ",No category line,500", // missing category still imports (Uncategorized fallback in budget validator)
].join("\n");

const TIMELINE_CSV = [
  "Task,Due Date,Status",
  "Confirm venue,2026-07-01,Not Started",
  "Lock agenda,2026-07-15,In Progress",
  ",2026-07-20,Done", // missing task -> skipped
].join("\n");

// --- sheet detection -------------------------------------------------------

test("detects exact sheet names for all three modules", () => {
  const wb = workbook([sheet("Run of Show", ROS_CSV), sheet("Budget", BUDGET_CSV), sheet("Timeline", TIMELINE_CSV)]);
  const detection = detectWorkbookSheets(wb);
  assert.equal(detection.sheets.find((item) => item.sheetName === "Run of Show")?.suggestedModule, "runOfShow");
  assert.equal(detection.sheets.find((item) => item.sheetName === "Budget")?.suggestedModule, "budget");
  assert.equal(detection.sheets.find((item) => item.sheetName === "Timeline")?.suggestedModule, "timeline");
});

test("detects sheets by alias and warns it used an alias", () => {
  const wb = workbook([sheet("Agenda", ROS_CSV), sheet("Expenses", BUDGET_CSV)]);
  const detection = detectWorkbookSheets(wb);
  assert.equal(detection.sheets.find((item) => item.sheetName === "Agenda")?.suggestedModule, "runOfShow");
  assert.equal(detection.sheets.find((item) => item.sheetName === "Expenses")?.suggestedModule, "budget");
});

test("missing sheet produces an info warning, not a hard failure", () => {
  const wb = workbook([sheet("Run of Show", ROS_CSV)]);
  const detection = detectWorkbookSheets(wb);
  assert.equal(detection.matched.budget, null);
  assert.equal(detection.matched.timeline, null);
  assert.ok(detection.warnings.some((w) => w.module === "budget" && /No Budget sheet is mapped yet/.test(w.message)));
});

test("ambiguous module sheets pick the first and warn", () => {
  const wb = workbook([sheet("Schedule", ROS_CSV), sheet("Sessions", ROS_CSV)]);
  const detection = detectWorkbookSheets(wb);
  assert.equal(buildInitialWorkbookSheetSelections(detection).Schedule, "notIncluded");
  assert.equal(buildInitialWorkbookSheetSelections(detection).Sessions, "notIncluded");
  assert.ok(detection.warnings.some((w) => w.severity === "warning" && /Multiple sheets/.test(w.message)));
});

test("Detailed Budget suggests Budget without requiring an exact tab name", () => {
  const detection = detectWorkbookSheets(workbook([sheet("Detailed Budget", BUDGET_CSV)]));
  const result = detection.sheets[0];
  assert.equal(result?.suggestedModule, "budget");
  assert.notEqual(result?.confidence, "unknown");
});

test("Detailed Budget filename with budget columns is detected as Budget", () => {
  const detection = detectWorkbookSheets(workbook([sheet("Sheet1", BUDGET_CSV)]), "Detailed Budget.xlsx");
  const result = detection.sheets[0];
  assert.equal(result?.suggestedModule, "budget");
  assert.notEqual(result?.confidence, "unknown");
  assert.equal(buildInitialWorkbookSheetSelections(detection).Sheet1, "budget");
});

test("Budget candidate remains visible even before its mapping tab is opened", () => {
  const sources = [
    { fileName: "Detailed Budget.xlsx", workbook: workbook([sheet("Detailed Budget", BUDGET_CSV)]) },
    { fileName: "Detailed Timeline.xlsx", workbook: workbook([sheet("Timeline", TIMELINE_CSV)]) },
    { fileName: "Program_Matrix_Detailed.xlsx", workbook: workbook([sheet("Program", ROS_CSV)]) },
  ];
  const preview = createImportPreviewFromWorkbookSources(sources, basics);
  assert.equal(preview.modules.budget.detected, true);
  assert.equal(preview.modules.timeline.detected, true);
  assert.equal(preview.modules.runOfShow.detected, true);
});

test("Budget is only missing when there is no budget candidate selected or detected", () => {
  const detection = detectWorkbookSheets(workbook([sheet("Timeline", TIMELINE_CSV), sheet("Program", ROS_CSV)]));
  assert.equal(detection.sheets.some((item) => item.suggestedModule === "budget"), false);
  assert.ok(detection.warnings.some((warning) => warning.module === "budget" && /No Budget sheet is mapped yet/.test(warning.message)));
});

test("sheet suggestions explain matched target columns", () => {
  const detection = detectWorkbookSheets(workbook([sheet("Sheet1", BUDGET_CSV)]));
  const result = detection.sheets[0];
  assert.equal(result?.suggestedModule, "budget");
  assert.match(result?.reason ?? "", /Matched Budget from columns:/);
  assert.match(result?.reason ?? "", /Category/);
});

test("sheet-name-only matches explain expected columns were not found", () => {
  const detection = detectWorkbookSheets(workbook([sheet("Expenses", "Notes\nbudget placeholder")]));
  const result = detection.sheets[0];
  assert.equal(result?.suggestedModule, "budget");
  assert.equal(result?.confidence, "low");
  assert.match(result?.reason ?? "", /Weak match: sheet name suggests Budget/);
  assert.match(result?.reason ?? "", /expected Budget columns were not found/);
});

test("Detailed F&B Budget is recognized without dead-ending the workbook flow", () => {
  const fnbCsv = [
    "Function,Component,Package,Guarantee,Subtotal,Tax,Gratuity",
    "Breakfast,Continental,Standard,120,1800,120,396",
  ].join("\n");
  const detection = detectWorkbookSheets(workbook([sheet("Detailed F&B Budget", fnbCsv)]));
  const result = detection.sheets[0];
  assert.equal(result?.suggestedModule, "fnbCatalog");
  assert.equal(result?.supported, false);
  assert.match(result?.reason ?? "", /cannot import/i);
});

test("generic Sheet1 can classify Budget from headers and content", () => {
  const detection = detectWorkbookSheets(workbook([sheet("Sheet1", BUDGET_CSV)]));
  assert.equal(detection.sheets[0]?.suggestedModule, "budget");
});

test("user can override sheet mapping manually", () => {
  const wb = workbook([sheet("Sheet1", BUDGET_CSV)]);
  const selections: WorkbookSheetSelections = { Sheet1: "runOfShow" };
  const preview = createImportPreviewFromWorkbook(wb, basics, "sheet1.xlsx", selections);
  assert.equal(preview.modules.runOfShow.detected, true);
  assert.equal(preview.modules.budget.detected, false);
});

test("user column overrides drive workbook preview and create plan", () => {
  const customBudgetCsv = [
    "Bucket,Description,Planned",
    "Housing,Hotel room block,225000",
  ].join("\n");
  const wb = workbook([sheet("Budget", customBudgetCsv)]);
  const budgetSheet = wb.sheets[0]!;
  const columnMappings = {
    Budget: {
      [budgetSheet.columns[0]!.id]: "category",
      [budgetSheet.columns[1]!.id]: "lineItem",
      [budgetSheet.columns[2]!.id]: "forecast",
    },
  };
  const selections: WorkbookSheetSelections = { Budget: "budget" };
  const preview = createImportPreviewFromWorkbook(wb, basics, "budget.xlsx", selections, columnMappings);
  const plan = buildWorkbookCreatePlan(wb, basics, selections, columnMappings);
  assert.equal(preview.modules.budget.validRowCount, 1);
  assert.equal(plan.budget[0]?.category, "Housing");
  assert.equal(plan.budget[0]?.lineItem, "Hotel room block");
  assert.equal(plan.workbookMappings?.[0]?.columnMapping.Bucket, "category");
});

test("duplicate sheet names across files are disambiguated in workbook mapping metadata", () => {
  const first = workbookSourceSheetName("Budget A.xlsx", "Budget");
  const second = workbookSourceSheetName("Budget B.xlsx", "Budget");
  const wb = workbook([sheet(first, BUDGET_CSV), sheet(second, BUDGET_CSV)]);
  const selections: WorkbookSheetSelections = { [first]: "budget", [second]: "notIncluded" };
  const plan = buildWorkbookCreatePlan(wb, basics, selections);
  assert.equal(plan.budget.length, 2);
  assert.equal(plan.workbookMappings?.find((mapping) => mapping.sourceSheetName === first)?.fileName, "Budget A.xlsx");
  assert.equal(plan.workbookMappings?.find((mapping) => mapping.sourceSheetName === second)?.skipped, true);
});

// --- per-module previews ---------------------------------------------------

test("Run of Show preview reuses matrix validation: counts, rooms, skipped", () => {
  const preview = buildRunOfShowPreview(sheet("Run of Show", ROS_CSV));
  assert.equal(preview.detected, true);
  assert.equal(preview.validRowCount, 3);
  assert.equal(preview.skippedRowCount, 1); // missing-title row
  assert.deepEqual(preview.roomsToCreate, ["Main Ballroom", "Room 204"]);
  assert.equal(preview.rows[0].title, "Opening Remarks");
  assert.equal(preview.rows[0].startTime, "09:00");
});

test("Run of Show preview preserves Setup, AV, and F&B operational notes", () => {
  const preview = buildRunOfShowPreview(
    sheet(
      "Run of Show",
      [
        "Session,Date,Start Time,End Time,Room,Setup,AV Requirements,F&B Service,Speakers/Facilitators",
        "Opening,2026-09-01,09:00,10:00,Main Ballroom,Theater,Stage AV,Coffee,CEO",
      ].join("\n"),
    ),
  );
  assert.equal(preview.validRowCount, 1);
  assert.equal(preview.mappedColumns.Session, "title");
  assert.equal(preview.mappedColumns.Date, "date");
  assert.equal(preview.mappedColumns["Start Time"], "startTime");
  assert.equal(preview.mappedColumns["End Time"], "endTime");
  assert.equal(preview.mappedColumns.Room, "room");
  assert.equal(preview.mappedColumns["Speakers/Facilitators"], "speakers");
  assert.equal(preview.mappedColumns.Setup, "setup");
  assert.equal(preview.mappedColumns["AV Requirements"], "av");
  assert.equal(preview.mappedColumns["F&B Service"], "fnb");
  assert.equal(preview.rows[0]?.setupType, "Theater");
  assert.equal(preview.rows[0]?.avNeeds, "Stage AV");
  assert.match(preview.rows[0]?.notes ?? "", /F&B: Coffee/);
});

test("Timeline plan preserves exact owner source and optional dates", () => {
  const wb = workbook([sheet("Timeline", "Task,Owner,Status,Workstream,Planning Stage\nBook venue,Planner@Example.com,At Risk,Production,Planning")]);
  const preview = createImportPreviewFromWorkbook(wb, basics, "timeline.csv", { Timeline: "timeline" });
  const plan = buildWorkbookCreatePlan(wb, basics, { Timeline: "timeline" });

  assert.equal(preview.modules.timeline.validRowCount, 1);
  assert.equal(preview.modules.timeline.rows[0]?.owner, "Planner@Example.com");
  assert.equal(preview.modules.timeline.rows[0]?.startDate, null);
  assert.equal(preview.modules.timeline.rows[0]?.endDate, null);
  assert.equal(plan.timeline[0]?.owner, "Planner@Example.com");
  assert.equal(plan.timeline[0]?.startDateIso, null);
  assert.equal(plan.timeline[0]?.endDateIso, null);
});

test("preview skip evidence includes invalid source rows and retains original row numbers", () => {
  const preview = buildTimelinePreview(sheet(
    "Timeline",
    "Task,Due Date\n,2026-07-01\n\nValid item,2026-07-03",
  ));

  assert.equal(preview.validRowCount, 1);
  assert.equal(preview.skippedRowCount, 1);
  assert.equal(preview.rows[0]?.sourceRowNumber, 4);
});

test("Budget preview reuses budget validation: totals + categories (Estimated Cost maps to forecast)", () => {
  const preview = buildBudgetPreview(sheet("Budget", BUDGET_CSV));
  assert.equal(preview.detected, true);
  assert.ok(preview.validRowCount >= 2);
  // 4500 + 1200 = at least 5700 dollars in cents
  assert.ok(preview.estimatedTotalCents >= 570000);
  assert.ok(preview.categoryCount >= 2);
});

test("Timeline preview reuses timeline validation: counts + status mapping", () => {
  const preview = buildTimelinePreview(sheet("Timeline", TIMELINE_CSV));
  assert.equal(preview.detected, true);
  assert.equal(preview.validRowCount, 2);
  assert.equal(preview.skippedRowCount, 1);
  assert.equal(preview.rows[0].status, "NOT_STARTED");
  assert.equal(preview.rows[1].status, "IN_PROGRESS");
});

test("Timeline source notes are visible in preview and carried into the canonical create plan", () => {
  const notesCsv = [
    "Task,Due Date,Notes",
    "Confirm venue,2026-07-01,Keep the venue hold until the contract is signed",
  ].join("\n");
  const wb = workbook([sheet("Timeline", notesCsv)]);
  const preview = createImportPreviewFromWorkbook(wb, basics, "timeline-notes.csv");
  const plan = buildWorkbookCreatePlan(wb, basics);

  assert.equal(preview.modules.timeline.rows[0]?.notes, "Keep the venue hold until the contract is signed");
  assert.equal(plan.timeline[0]?.notes, "Keep the venue hold until the contract is signed");
});

// --- end-to-end workbook preview -------------------------------------------

test("createImportPreviewFromWorkbook assembles all modules; partial workbook still previews", () => {
  const full = createImportPreviewFromWorkbook(
    workbook([sheet("Run of Show", ROS_CSV), sheet("Budget", BUDGET_CSV), sheet("Timeline", TIMELINE_CSV)]),
    basics,
    "plan.xlsx",
  );
  const summary = summarizeEventImportPreview(full);
  assert.equal(full.sourceType, "workbook");
  assert.equal(full.fileName, "plan.xlsx");
  assert.equal(summary.runOfShowRowsToCreate, 3);
  assert.ok(summary.hasAnyValidRows);

  // Missing Budget + Timeline: ROS still previews, others undetected.
  const partial = createImportPreviewFromWorkbook(workbook([sheet("Run of Show", ROS_CSV)]), basics);
  assert.equal(partial.modules.runOfShow.detected, true);
  assert.equal(partial.modules.budget.detected, false);
  assert.equal(partial.modules.timeline.detected, false);
  assert.ok(summarizeEventImportPreview(partial).hasAnyValidRows);
});

test("partial Budget-only import enables preview without exact sheet-name matching", () => {
  const wb = workbook([sheet("Detailed Budget", BUDGET_CSV)]);
  const preview = createImportPreviewFromWorkbook(wb, basics, "budget.xlsx");
  assert.equal(preview.modules.budget.detected, true);
  assert.equal(preview.modules.runOfShow.detected, false);
  assert.ok(summarizeEventImportPreview(preview).hasAnyValidRows);
});

test("selected Budget mapping does not keep a contradictory unmapped warning", () => {
  const wb = workbook([sheet("Detailed Budget", BUDGET_CSV), sheet("Backup Budget", BUDGET_CSV)]);
  const preview = createImportPreviewFromWorkbook(wb, basics, "budget.xlsx", {
    "Detailed Budget": "budget",
    "Backup Budget": "notIncluded",
  });

  assert.equal(preview.modules.budget.detected, true);
  assert.equal(preview.modules.budget.validRowCount > 0, true);
  assert.ok(!preview.modules.budget.warnings.some((warning) => /No Budget sheet is mapped yet/.test(warning.message)));
});

test("multiple source files preview together with source file sheet names", () => {
  const sources = [
    { fileName: "Run of Show.xlsx", workbook: workbook([sheet("Agenda / ROS", ROS_CSV)]) },
    { fileName: "Budget.csv", workbook: workbook([sheet("Budget.csv", BUDGET_CSV)]) },
    { fileName: "Detailed Timeline.xlsx", workbook: workbook([sheet("Detailed Timeline", TIMELINE_CSV)]) },
  ];
  const selections: WorkbookSheetSelections = {
    [workbookSourceSheetName("Run of Show.xlsx", "Agenda / ROS")]: "runOfShow",
    [workbookSourceSheetName("Budget.csv", "Budget.csv")]: "budget",
    [workbookSourceSheetName("Detailed Timeline.xlsx", "Detailed Timeline")]: "timeline",
  };

  const preview = createImportPreviewFromWorkbookSources(sources, basics, selections);
  const summary = summarizeEventImportPreview(preview);
  assert.equal(preview.fileName, "Run of Show.xlsx, Budget.csv, Detailed Timeline.xlsx");
  assert.equal(preview.modules.runOfShow.detected, true);
  assert.equal(preview.modules.budget.detected, true);
  assert.equal(preview.modules.timeline.detected, true);
  assert.equal(preview.modules.runOfShow.sheetName, "Run of Show.xlsx / Agenda / ROS");
  assert.ok(summary.hasAnyValidRows);
});

test("workbook preview warnings include module source file sheet row and field attribution", () => {
  const preview = createImportPreviewFromWorkbookSources(
    [{ fileName: "Detailed Timeline.xlsx", workbook: workbook([sheet("Detailed Timeline", TIMELINE_CSV)]) }],
    basics,
  );
  const issue = preview.modules.timeline.warnings.find((warning) => warning.rowNumber === 4);
  assert.equal(issue?.module, "timeline");
  assert.equal(issue?.sourceFileName, "Detailed Timeline.xlsx");
  assert.equal(issue?.sheetName, "Detailed Timeline");
  assert.equal(issue?.field, "Item");
  assert.match(issue?.message ?? "", /Item is required/);
});

test("review preview can show selected mappings and skipped sheets", () => {
  const wb = workbook([sheet("Detailed Budget", BUDGET_CSV), sheet("Sheet1", TIMELINE_CSV)]);
  const selections: WorkbookSheetSelections = { "Detailed Budget": "budget", Sheet1: "notIncluded" };
  const preview = createImportPreviewFromWorkbook(wb, basics, "mixed.xlsx", selections);
  assert.ok(preview.globalWarnings.some((warning) => /Skipped sheets: Sheet1/.test(warning.message)));
});

test("empty workbook flags a global error and creates nothing", () => {
  const preview = createImportPreviewFromWorkbook(workbook([]), basics);
  assert.ok(preview.globalWarnings.some((w) => w.severity === "error"));
  assert.equal(summarizeEventImportPreview(preview).hasAnyValidRows, false);
});

// --- create plan -----------------------------------------------------------

test("buildWorkbookCreatePlan emits canonical, writable rows for each module", () => {
  const plan = buildWorkbookCreatePlan(
    workbook([sheet("Run of Show", ROS_CSV), sheet("Budget", BUDGET_CSV), sheet("Timeline", TIMELINE_CSV)]),
    basics,
  );
  assert.equal(plan.sourceType, "workbook");
  assert.equal(plan.eventBasics.name, "Conf");

  // Run of Show rows carry the canonical matrix-import shape.
  assert.equal(plan.runOfShow.length, 3);
  assert.equal(plan.runOfShow[0].sessionName, "Opening Remarks");
  assert.equal(plan.runOfShow[0].dayDateIso, "2026-09-01");
  assert.equal(plan.runOfShow[0].startTime, "09:00");
  assert.equal(plan.runOfShow[0].roomName, "Main Ballroom");

  // Budget rows carry cents + category.
  assert.ok(plan.budget.length >= 2);
  assert.equal(plan.budget[0].category, "Venue");
  assert.equal(plan.budget[0].forecastCents, 450000);

  // Timeline rows carry a canonical status.
  assert.equal(plan.timeline.length, 2);
  assert.equal(plan.timeline[0].title, "Confirm venue");
  assert.equal(plan.timeline[0].status, "NOT_STARTED");

  // Workbooks do not infer dependencies (documented limitation).
  assert.deepEqual(plan.timelineDependencies, []);
});

test("buildWorkbookSourcesCreatePlan imports selected sheets across multiple files", () => {
  const sources = [
    { fileName: "ros.xlsx", workbook: workbook([sheet("Sheet1", ROS_CSV)]) },
    { fileName: "budget.xlsx", workbook: workbook([sheet("Sheet1", BUDGET_CSV)]) },
    { fileName: "timeline.xlsx", workbook: workbook([sheet("Sheet1", TIMELINE_CSV)]) },
  ];
  const plan = buildWorkbookSourcesCreatePlan(sources, basics, {
    [workbookSourceSheetName("ros.xlsx", "Sheet1")]: "runOfShow",
    [workbookSourceSheetName("budget.xlsx", "Sheet1")]: "budget",
    [workbookSourceSheetName("timeline.xlsx", "Sheet1")]: "timeline",
  });

  assert.equal(plan.runOfShow.length, 3);
  assert.ok(plan.budget.length >= 2);
  assert.equal(plan.timeline.length, 2);
});

test("buildWorkbookCreatePlan omits skipped rows (missing required fields)", () => {
  const plan = buildWorkbookCreatePlan(workbook([sheet("Run of Show", ROS_CSV)]), basics);
  // The 4th ROS row has no title and must not appear in the writable plan.
  assert.equal(plan.runOfShow.length, 3);
  assert.ok(plan.runOfShow.every((r) => r.sessionName.trim().length > 0));
});

test("zero mapped sheets keeps preview disabled and create plan empty", () => {
  const wb = workbook([sheet("Detailed Budget", BUDGET_CSV)]);
  const plan = buildWorkbookCreatePlan(wb, basics, { "Detailed Budget": "notIncluded" });
  assert.equal(plan.runOfShow.length, 0);
  assert.equal(plan.budget.length, 0);
  assert.equal(plan.timeline.length, 0);
});
