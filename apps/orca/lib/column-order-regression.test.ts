import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reorderColumnOrder } from "../components/column-order-control";

const helperSource = readFileSync("components/column-order-control.tsx", "utf8");
const matrixSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const timelineListSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const timelinePageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const budgetSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

test("shared column order helper persists a scoped localStorage key", () => {
  assert.match(helperSource, /const STORAGE_PREFIX = "plannerDash:columnOrder"/);
  assert.match(helperSource, /buildColumnOrderStorageKey/);
  assert.match(helperSource, /stableScopePart\(scope\.userId, "anonymous"\)/);
  assert.match(helperSource, /stableScopePart\(scope\.orgId, "no-org"\)/);
  assert.match(helperSource, /stableScopePart\(scope\.eventId, "no-event"\)/);
  assert.match(helperSource, /stableScopePart\(scope\.viewId, "unknown-view"\)/);
  assert.match(helperSource, /window\.localStorage\.setItem\(storageKey, JSON\.stringify\(normalized\)\)/);
  assert.match(helperSource, /window\.localStorage\.removeItem\(storageKey\)/);
});

test("shared column header reorder helper exposes direct drag/drop affordances", () => {
  assert.deepEqual(reorderColumnOrder(["session", "group", "forecast"], "forecast", "session", "before"), [
    "forecast",
    "session",
    "group",
  ]);
  assert.deepEqual(reorderColumnOrder(["session", "group", "forecast"], "session", "forecast", "after"), [
    "group",
    "forecast",
    "session",
  ]);
  assert.match(helperSource, /export function useColumnHeaderReorder/);
  assert.match(helperSource, /export function reorderColumnOrder/);
  assert.match(helperSource, /"data-column-reorder-header": column\.id/);
  assert.match(helperSource, /draggable: true/);
  assert.match(helperSource, /event\.dataTransfer\.effectAllowed = "move"/);
  assert.match(helperSource, /before:bg-\[#28439A\]/);
  assert.match(helperSource, /after:bg-\[#28439A\]/);
  assert.match(helperSource, /cursor-grab/);
  assert.match(helperSource, /suppressClickRef/);
  assert.match(helperSource, /shouldSuppressHeaderClick/);
  assert.match(helperSource, /GripVertical/);
});

test("Run of Show list view uses direct header drag order with pinned selection and actions", () => {
  assert.match(matrixSource, /MATRIX_OVERVIEW_COLUMNS: ColumnOrderItem<MatrixOverviewColumnId>\[\]/);
  assert.match(matrixSource, /MATRIX_OVERVIEW_PINNED_COLUMNS: ColumnOrderItem\[\]/);
  assert.match(matrixSource, /viewId: "run-of-show:list"/);
  assert.match(matrixSource, /useColumnHeaderReorder/);
  assert.match(matrixSource, /getHeaderReorderProps\(column\)/);
  assert.match(matrixSource, /getHeaderReorderClassName\(column\.id/);
  assert.match(matrixSource, /ColumnHeaderDragHandle/);
  assert.match(matrixSource, /data-column-pinned-header="select"/);
  assert.match(matrixSource, /data-column-pinned-header="actions"/);
  assert.match(matrixSource, /shouldSuppressClick=\{shouldSuppressHeaderClick\}/);
  assert.doesNotMatch(matrixSource, /<ColumnOrderControl/);
  assert.match(matrixSource, /orderedColumns\.map\(\(column\) =>/);
  assert.match(matrixSource, /case "speakers":/);
  assert.match(matrixSource, /case "conflicts":/);
});

test("Roadmap list view uses direct header drag order with pinned selection and item identity", () => {
  assert.match(timelineListSource, /TIMELINE_LIST_COLUMNS: ColumnOrderItem<TimelineListColumnId>\[\]/);
  assert.match(timelineListSource, /TIMELINE_PINNED_COLUMNS: ColumnOrderItem\[\]/);
  assert.match(timelineListSource, /viewId: "roadmap:list"/);
  assert.match(timelineListSource, /useColumnHeaderReorder/);
  assert.match(timelineListSource, /getHeaderReorderProps\(column\)/);
  assert.match(timelineListSource, /getHeaderReorderClassName\(/);
  assert.match(timelineListSource, /ColumnHeaderDragHandle/);
  assert.match(timelineListSource, /data-column-pinned-header="select"/);
  assert.match(timelineListSource, /data-column-pinned-header="title"/);
  assert.doesNotMatch(timelineListSource, /<ColumnOrderControl/);
  assert.match(timelineListSource, /orderedColumns\.map\(\(column\) =>/);
  assert.match(timelinePageSource, /eventId=\{selectedEventId\}/);
});

test("Budget line-item list uses direct header drag order with pinned selection and category", () => {
  assert.match(budgetSource, /BUDGET_LINE_ITEM_COLUMNS: ColumnOrderItem<BudgetColumnId>\[\]/);
  assert.match(budgetSource, /BUDGET_PINNED_COLUMNS: ColumnOrderItem\[\]/);
  assert.match(budgetSource, /BUDGET_COLUMN_WIDTHS: Record<BudgetColumnId, number>/);
  assert.match(budgetSource, /viewId: "budget:list"/);
  assert.match(budgetSource, /useColumnHeaderReorder/);
  assert.match(budgetSource, /getHeaderReorderProps\(column\)/);
  assert.match(budgetSource, /getHeaderReorderClassName\(/);
  assert.match(budgetSource, /ColumnHeaderDragHandle/);
  assert.match(budgetSource, /data-column-pinned-header="select"/);
  assert.match(budgetSource, /data-column-pinned-header=\{key === "category" \? "category" : undefined\}/);
  assert.match(budgetSource, /shouldSuppressHeaderClick/);
  assert.doesNotMatch(budgetSource, /<ColumnOrderControl/);
  assert.match(budgetSource, /orderedColumns\.map\(\(column\) => renderBudgetColumnHeader\(column\)\)/);
  assert.match(budgetSource, /case "approval":/);
});
