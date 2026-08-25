import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const boardSource = readFileSync("app/(shell)/timeline/_components/TimelineBoardView.tsx", "utf8");
const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const ganttSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");

test("board cards show workstream and planning stage context", () => {
  assert.ok(boardSource.includes("getWorkstreamLabel(workstreamKeyFor(item))"));
  assert.ok(boardSource.includes("getWorkstreamTheme(workstreamKeyFor(item))"));
  assert.ok(boardSource.includes("getPlanningStageLabel(item.planningStage)"));
});

test("list view exposes workstream and stage columns", () => {
  assert.ok(listSource.includes('{ id: "workstream", label: "Workstream" }'));
  assert.ok(listSource.includes('{ id: "planningStage", label: "Stage" }'));
  assert.ok(listSource.includes("orderedColumns.map((column) => ("));
  assert.ok(listSource.includes("getWorkstreamLabel(item.workstream ?? item.department)"));
  assert.ok(listSource.includes("getPlanningStageLabel(item.planningStage)"));
});

test("timeline gantt groups rows by workstream and labels items by stage", () => {
  assert.ok(ganttSource.includes("function workstreamGroupKey"));
  assert.ok(ganttSource.includes("const key = workstreamGroupKey(task);"));
  assert.ok(ganttSource.includes("getWorkstreamLabel(key)"));
  assert.ok(ganttSource.includes("getPlanningStageLabel(task.planningStage)"));
  // legacy category grouping helpers are no longer used
  assert.equal(ganttSource.includes("normalizeCategoryKey(task.department)"), false);
});

test("timeline gantt honors the explicit critical-path flag", () => {
  assert.ok(ganttSource.includes("task.isCriticalPath || task.priority === \"CRITICAL\""));
});

test("timeline toolbar filters by workstream and planning stage", () => {
  assert.ok(pageSource.includes('aria-label="Filter by workstream"'));
  assert.ok(pageSource.includes('aria-label="Filter by planning stage"'));
  assert.ok(pageSource.includes("All Workstreams"));
  assert.ok(pageSource.includes("All Stages"));
  assert.ok(pageSource.includes("resolveWorkstream(item.workstream ?? item.department)"));
});
