import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matrixSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const timelinePageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const budgetSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Run of Show command-center save patches local snapshot without a list reload", () => {
  const saveSessionEdit = sourceBetween(
    matrixSource,
    "const handleSaveSessionEdit = useCallback",
    "const handleSaveOverviewSession = useCallback",
  );
  assert.match(saveSessionEdit, /setSnapshot\(\(current\) =>/);
  assert.match(saveSessionEdit, /speakerAssignments/);
  assert.doesNotMatch(saveSessionEdit, /await loadSnapshot\(selectedEventId\)/);
});

test("Run of Show overview row save patches local snapshot without a list reload", () => {
  const saveOverviewSession = sourceBetween(
    matrixSource,
    "const handleSaveOverviewSession = useCallback",
    "const handleBulkUpdateOverviewSessions = useCallback",
  );
  assert.match(saveOverviewSession, /setSnapshot\(\(current\) =>/);
  assert.match(saveOverviewSession, /requirementSelections/);
  assert.doesNotMatch(saveOverviewSession, /await loadSnapshot\(selectedEventId\)/);
});

test("Run of Show bulk update preserves selection and avoids full snapshot reload", () => {
  const bulkUpdate = sourceBetween(
    matrixSource,
    "const handleBulkUpdateOverviewSessions = useCallback",
    "const handleBulkDeleteOverviewSessions = useCallback",
  );
  assert.match(bulkUpdate, /setSnapshot\(\(current\) =>/);
  assert.match(bulkUpdate, /setFlashMessage/);
  assert.doesNotMatch(bulkUpdate, /await loadSnapshot\(selectedEventId\)/);
  assert.doesNotMatch(bulkUpdate, /setSelectedOverviewSessionIds\(new Set\(\)\)/);
});

test("Run of Show bulk delete is the explicit row-removal exception", () => {
  const bulkDelete = sourceBetween(
    matrixSource,
    "const handleBulkDeleteOverviewSessions = useCallback",
    "const handleAssignSpeakerAssignment = useCallback",
  );
  assert.match(bulkDelete, /await loadSnapshot\(selectedEventId\)/);
  assert.match(bulkDelete, /setSelectedOverviewSessionIds\(\(current\) =>/);
  assert.match(bulkDelete, /next\.delete\(session\.id\)/);
});

test("Roadmap bulk update still patches local state instead of reloading the list", () => {
  const bulkUpdate = sourceBetween(
    timelinePageSource,
    "const handleBulkUpdateItems = useCallback",
    "const handleBulkDeleteItems = useCallback",
  );
  assert.match(bulkUpdate, /setItems\(\(current\) =>/);
  assert.match(bulkUpdate, /setDashboardRefreshToken\(\(current\) => current \+ 1\)/);
  assert.doesNotMatch(bulkUpdate, /await loadItems\(selectedEventId\)/);
  assert.doesNotMatch(bulkUpdate, /router\.refresh\(\)/);
});

test("Budget approval refreshes preserve table state", () => {
  const approvalMutations = sourceBetween(
    budgetSource,
    "async function handleSubmitSelectedForApproval",
    "async function handleDeleteSelectedLineItems",
  );
  const preserveMatches = approvalMutations.match(/preserveTableState: true/g) ?? [];
  assert.equal(preserveMatches.length, 4);
});

test("Budget delete removes deleted rows locally and reconciles without loadBudget", () => {
  const deleteSelected = sourceBetween(
    budgetSource,
    "async function handleDeleteSelectedLineItems",
    "async function handleExportBudgetCsv",
  );
  assert.match(deleteSelected, /setPagedLineItems\(\(current\) => current\.filter/);
  assert.match(deleteSelected, /setSelectedLineItemIds\(\(current\) => current\.filter/);
  assert.match(deleteSelected, /setDirtyOverlay\(\(current\) =>/);
  assert.match(deleteSelected, /reconcileBudgetAfterMutation\(\)/);
  assert.doesNotMatch(deleteSelected, /await loadBudget\(selectedEventId/);
});
