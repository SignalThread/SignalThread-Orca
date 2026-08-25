import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyEventImportPreview,
  summarizeEventImportPreview,
  type BudgetPreviewRow,
  type EventImportBasics,
  type EventImportPreview,
} from "./event-import-types";

const basics: EventImportBasics = {
  name: "Annual Conference",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  timezone: "America/New_York",
};

test("empty preview has all three modules undetected and no valid rows", () => {
  const preview = emptyEventImportPreview(basics, "workbook");
  const summary = summarizeEventImportPreview(preview);
  assert.equal(preview.modules.runOfShow.detected, false);
  assert.equal(preview.modules.budget.detected, false);
  assert.equal(preview.modules.timeline.detected, false);
  assert.equal(summary.hasAnyValidRows, false);
  assert.equal(summary.runOfShowRowsToCreate, 0);
});

function populate(preview: EventImportPreview): EventImportPreview {
  preview.modules.runOfShow.detected = true;
  preview.modules.runOfShow.validRowCount = 10;
  preview.modules.runOfShow.skippedRowCount = 2;
  preview.modules.runOfShow.roomsToCreate = ["Main Ballroom", "Room 204"];
  preview.modules.runOfShow.warnings.push({ module: "runOfShow", severity: "warning", message: "x" });

  const budgetRows: BudgetPreviewRow[] = [
    { category: "Venue", lineItem: "Hall", vendor: null, estimatedCents: 100000, actualCents: null },
  ];
  preview.modules.budget.detected = true;
  preview.modules.budget.rows = budgetRows;
  preview.modules.budget.validRowCount = 5;
  preview.modules.budget.skippedRowCount = 1;
  preview.modules.budget.estimatedTotalCents = 100000;
  preview.modules.budget.categoryCount = 3;

  preview.modules.timeline.detected = true;
  preview.modules.timeline.validRowCount = 7;
  preview.modules.timeline.skippedRowCount = 3;
  preview.modules.timeline.dependencyCount = 2;
  return preview;
}

test("summarize aggregates counts, rooms, warnings, and skipped rows across modules", () => {
  const preview = populate(emptyEventImportPreview(basics, "workbook"));
  const summary = summarizeEventImportPreview(preview);
  assert.equal(summary.runOfShowRowsToCreate, 10);
  assert.equal(summary.budgetLineItemsToCreate, 5);
  assert.equal(summary.timelineItemsToCreate, 7);
  assert.equal(summary.roomsToCreate, 2);
  assert.equal(summary.timelineDependencies, 2);
  assert.equal(summary.estimatedTotalCents, 100000);
  assert.equal(summary.totalSkippedRows, 2 + 1 + 3);
  assert.equal(summary.totalWarnings, 1);
  assert.equal(summary.hasAnyValidRows, true);
});

test("hasAnyValidRows is false for a workspace-only (blank) preview", () => {
  const summary = summarizeEventImportPreview(emptyEventImportPreview(basics, "blank"));
  assert.equal(summary.hasAnyValidRows, false);
});
