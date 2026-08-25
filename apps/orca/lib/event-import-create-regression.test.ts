import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { BudgetLineItemStatus } from "@prisma/client";
import { buildBudgetImportCreateData } from "@/src/server/services/budget";
import { parseCsv, type ParsedSheet, type ParsedWorkbook } from "@/lib/import";
import {
  buildWorkbookCreatePlan,
  workbookSourceSheetName,
  type WorkbookSheetSelections,
} from "@/lib/event-import-builder";
import type { EventImportBasics } from "@/lib/event-import-types";

const orchestratorSource = readFileSync("src/server/services/event-import-builder.ts", "utf8");
const routeSource = readFileSync("app/api/events/import/create/route.ts", "utf8");
const eventsSource = readFileSync("lib/events.ts", "utf8");
const builderSource = readFileSync("app/(shell)/events/_components/new-event-builder.tsx", "utf8");
const importBuilderSource = readFileSync("lib/event-import-builder.ts", "utf8");

const basics: EventImportBasics = {
  name: "Create regression event",
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

test("create route exists and delegates to the canonical orchestrator", () => {
  assert.ok(existsSync("app/api/events/import/create/route.ts"));
  assert.match(routeSource, /createEventFromImportPlan/);
  assert.match(routeSource, /resolveRequestUser/);
});

test("events.ts exposes a transaction-accepting create reused by the public createEvent", () => {
  assert.match(eventsSource, /export async function createEventWithinTransaction\(\s*tx: Prisma\.TransactionClient/);
  assert.match(eventsSource, /createEventWithinTransaction\(tx, input, context\)/);
});

test("orchestration is one atomic transaction owning all module writes", () => {
  assert.match(orchestratorSource, /getPrisma\(\)\.\$transaction\(async \(tx\) =>/);
  // Reuses the canonical create-data builders, not parallel write logic.
  assert.match(orchestratorSource, /createEventWithinTransaction\(/);
  assert.match(orchestratorSource, /buildMatrixImportCreateData\(/);
  assert.match(orchestratorSource, /buildBudgetImportCreateData\(/);
  assert.match(orchestratorSource, /buildTimelineImportCreateData\(/);
  // Writes go through the transaction client.
  assert.match(orchestratorSource, /tx\.matrixRow\.create\(/);
  assert.match(orchestratorSource, /tx\.budgetLineItem\.createMany/);
  assert.match(orchestratorSource, /tx\.timelineItem\.createMany/);
});

test("event import creates and assigns speakers from Run of Show speaker notes", () => {
  assert.match(orchestratorSource, /extractSpeakerLine/);
  assert.match(orchestratorSource, /parseSpeakerEntry/);
  assert.match(orchestratorSource, /tx\.speaker\.create/);
  assert.match(orchestratorSource, /tx\.sessionSpeakerAssignment\.createMany/);
  assert.match(orchestratorSource, /skipDuplicates: true/);
});

test("rooms are event-scoped, deduped, and linked onto matrix rows by name", () => {
  assert.match(orchestratorSource, /tx\.room\.createMany/);
  assert.match(orchestratorSource, /skipDuplicates: true/);
  assert.match(orchestratorSource, /roomId: key \? roomIdByKey\.get\(key\) \?\? null : null/);
});

test("dependencies are created only for unique title matches, else warned", () => {
  assert.match(orchestratorSource, /pre\?\.length === 1 && suc\?\.length === 1 && pre\[0\] !== suc\[0\]/);
  assert.match(orchestratorSource, /could not be linked \(no unique match\)/);
});

test("orchestration enforces org scope and validates basics server-side", () => {
  assert.match(orchestratorSource, /if \(!user\.orgId\)/);
  assert.match(orchestratorSource, /canListOrganizationEvents\(user\.role\)/);
  assert.match(orchestratorSource, /Organization owner or admin role required to create events/);
  assert.match(orchestratorSource, /validateApprovedRequest\(request\)/);
  assert.match(orchestratorSource, /End date cannot be before the start date/);
  assert.match(orchestratorSource, /isSupportedTimezone\(plan\.eventBasics\.timezone\)/);
  assert.match(orchestratorSource, /Select a valid timezone/);
  assert.match(orchestratorSource, /Select at least one import target before creating the workspace/);
  assert.match(orchestratorSource, /Invalid import source type/);
});

test("event import route preserves the authenticated role and records a non-sensitive import summary", () => {
  assert.match(routeSource, /role: currentUserResult\.user\.role/);
  assert.match(orchestratorSource, /action: "IMPORTED"/);
  assert.match(orchestratorSource, /entityType: "EventImport"/);
});

test("create orchestration submits the selected event timezone without falling through to defaults", () => {
  assert.match(orchestratorSource, /timezone: plan\.eventBasics\.timezone,/);
  assert.doesNotMatch(orchestratorSource, /plan\.eventBasics\.timezone \|\| undefined/);
});

test("builder create plans use hidden event basics timezone as source of truth", () => {
  assert.match(builderSource, /timezone: getEventCreationDefaultTimezone\(\)/);
  assert.match(builderSource, /buildWorkbookSourcesCreatePlan\(parsedWorkbookSources, basics, workbookSelections, workbookColumnMappings\)/);
  assert.match(builderSource, /buildAgendaCreatePlan\(pasteText, basics\)/);
  assert.match(builderSource, /buildTemplateCreatePlan\(templateKey, basics\)/);
  assert.match(builderSource, /eventBasics: basics/);
  assert.doesNotMatch(builderSource, /<select\s+value=\{basics\.timezone\}/);
});

test("workbook create payload includes confirmed mapping metadata and skips excluded sheets", () => {
  assert.match(importBuilderSource, /workbookMappings: EventImportWorkbookMapping\[\]/);
  assert.match(importBuilderSource, /selectedTarget:/);
  assert.match(importBuilderSource, /columnMapping: Object\.fromEntries/);
  assert.match(importBuilderSource, /skipped: selectedTarget === "notIncluded"/);
  assert.match(orchestratorSource, /for \(const mapping of plan\.workbookMappings \?\? \[\]\)/);
  assert.match(orchestratorSource, /if \(mapping\.skipped \|\| mapping\.selectedTarget === "notIncluded"\) continue/);
});

test("budget create data treats null reviewed status as the existing PLANNED default", () => {
  const [row] = buildBudgetImportCreateData(
    "00000000-0000-0000-0000-000000000000",
    [
      {
        category: "Housing",
        subcategory: null,
        lineItem: "Hotel room block",
        vendor: null,
        forecastCents: 22500000,
        actualCents: 0,
        status: null,
      },
    ],
    0,
  );

  assert.equal(row.status, BudgetLineItemStatus.PLANNED);
});

test("workbook create plan excludes sheets mapped to Don't include", () => {
  const budgetCsv = [
    "Category,Subcategory,Line Item,Planned,Actual",
    "Housing,Lodging,Hotel room block,225000,0",
    "AV,Production,Main stage package,12000,4200",
  ].join("\n");
  const fnbCsv = [
    "Function,Component,Package,Guarantee,Subtotal",
    "Breakfast,Continental,Standard,120,1800",
  ].join("\n");
  const selections: WorkbookSheetSelections = {
    [workbookSourceSheetName("Detailed_Budget.xlsx", "Detailed Budget")]: "budget",
    [workbookSourceSheetName("Detailed_Budget.xlsx", "Detailed F&B Budget")]: "notIncluded",
  };

  const plan = buildWorkbookCreatePlan(
    workbook([
      sheet(workbookSourceSheetName("Detailed_Budget.xlsx", "Detailed Budget"), budgetCsv),
      sheet(workbookSourceSheetName("Detailed_Budget.xlsx", "Detailed F&B Budget"), fnbCsv),
    ]),
    basics,
    selections,
  );

  assert.equal(plan.budget.length, 2);
  assert.ok(plan.budget.every((row) => row.category !== "Breakfast"));
  assert.equal(plan.runOfShow.length, 0);
  assert.equal(plan.timeline.length, 0);
});

test("budget mapped from a non-Budget sheet still creates budget line item payloads", () => {
  const plan = buildWorkbookCreatePlan(
    workbook([sheet("Detailed Budget", "Category,Line Item,Planned\nHousing,Hotel room block,225000")]),
    basics,
    { "Detailed Budget": "budget" },
  );

  assert.equal(plan.budget.length, 1);
  assert.equal(plan.budget[0].category, "Housing");
});

test("create route returns structured errors for invalid create payloads", () => {
  assert.match(routeSource, /errorResponse\("Invalid JSON body", 400, "INVALID_JSON"\)/);
  assert.match(routeSource, /errorResponse\("Request body must be an object", 400, "INVALID_CREATE_PAYLOAD"\)/);
  assert.match(routeSource, /errorResponse\(error\.message, error\.status, error\.code\)/);
  assert.match(routeSource, /message/);
});

test("the builder posts a single create call and routes to the new event on success", () => {
  // One canonical endpoint, not a chain of module writes.
  const fetchCount = (builderSource.match(/fetch\("\/api\/events\/import\/create"/g) ?? []).length;
  assert.equal(fetchCount, 1);
  // No second create flow; docs may show an in-place post-create retry result.
  assert.match(builderSource, /router\.replace\(`\/events\/\$\{payload\.eventId\}\?created=1`\)/);
  assert.doesNotMatch(builderSource, /setStep\("success"\)/);
  assert.match(builderSource, /buildWorkbookSourcesCreatePlan\(parsedWorkbookSources, basics, workbookSelections, workbookColumnMappings\)/);
  assert.match(builderSource, /payload\?\.message \?\? payload\?\.error/);
  assert.match(builderSource, /AdditionalDocsPostCreatePanel/);
});

test("blank review still creates through the canonical create endpoint", () => {
  assert.match(builderSource, /sourceType: "blank"/);
  assert.match(builderSource, /emptyEventImportPreview\(basics, "blank"\)/);
  assert.match(builderSource, /router\.replace\(`\/events\/\$\{payload\.eventId\}\?created=1`\)/);
});

test("the builder disables the create button while creating (no double-submit)", () => {
  assert.match(builderSource, /disabled=\{\s*isCreating\s*\|\|/);
  assert.match(builderSource, /Creating workspace…/);
});

test("failed create stays in the review flow and displays the server error", () => {
  assert.match(builderSource, /throw new Error\(payload\?\.message \?\? payload\?\.error \?\? "Failed to create the event workspace\."\)/);
  assert.match(builderSource, /setErrorMessage\(error instanceof Error \? error\.message : "Failed to create the event workspace\."\)/);
  assert.match(builderSource, /setIsCreating\(false\)/);
  assert.match(builderSource, /let receivedCreateResponse = false/);
  assert.match(builderSource, /receivedCreateResponse = true/);
  assert.match(builderSource, /if \(receivedCreateResponse\) \{\s*importIdempotencyKeyRef\.current = null;/);
  assert.match(builderSource, /Retry create event workspace/);
  assert.doesNotMatch(builderSource, /router\.replace\(`\/events\/\$\{payload\.eventId\}\?created=1`\);\s+setErrorMessage/);
});
