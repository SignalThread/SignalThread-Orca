import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Roadmap bulk controls follow visible editable column order", () => {
  const bulkBar = sourceBetween(listSource, "Set workstream...", "Clear selection");
  const order = [
    "Set workstream...",
    "Set stage...",
    "Set status...",
    "Progress %",
    "Set priority...",
    "Set owner...",
    "Set critical path...",
  ];
  let cursor = -1;
  for (const label of order) {
    const index = bulkBar.indexOf(label);
    assert.ok(index > cursor, `${label} should appear after the previous bulk control`);
    cursor = index;
  }
});

test("Roadmap bulk controls follow persisted column order at render time", () => {
  for (const column of ["workstream", "planningStage", "status", "progress", "priority", "ownerUserId", "isCriticalPath"]) {
    assert.match(listSource, new RegExp(`style=\\{\\{ order: columnOrder\\.indexOf\\(\\"${column}\\"\\) \\}\\}`));
  }
});

test("Roadmap bulk update success does not clear selected rows", () => {
  const applyBulkPatch = sourceBetween(listSource, "async function applyBulkPatch", "async function deleteSelectedRows");
  assert.match(applyBulkPatch, /await onBulkUpdate\(selectedVisibleIds, patch\)/);
  assert.doesNotMatch(applyBulkPatch, /setSelectedIds\(new Set\(\)\)/);
});

test("Roadmap bulk update patches local state instead of reloading the whole list", () => {
  const bulkUpdate = sourceBetween(pageSource, "const handleBulkUpdateItems = useCallback", "const handleBulkDeleteItems = useCallback");
  assert.match(bulkUpdate, /setItems\(\(current\) =>/);
  assert.match(bulkUpdate, /setDashboardRefreshToken\(\(current\) => current \+ 1\)/);
  assert.doesNotMatch(bulkUpdate, /await loadItems\(selectedEventId\)/);
  assert.doesNotMatch(bulkUpdate, /router\.refresh\(\)/);
});
