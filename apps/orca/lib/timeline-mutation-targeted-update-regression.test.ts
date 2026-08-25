import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Targeted-mutation coverage for the Timeline page (Roadmap/Timeline performance
// Prompt 4). Several mutations used to call loadItems()/router.refresh() and
// reload the whole event after changing a few rows. Where the outcome is
// provable from local state or a full server record, we now update React state
// directly; where the server response mass-creates rows (import), we keep the
// full reload on purpose. This is a source-regression: the
// client page is not rendered in the node --test runner.

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");

function sliceHandler(marker: string): string {
  const start = pageSource.indexOf(marker);
  assert.ok(start > -1, `handler marker not found: ${marker}`);
  // Grab a generous window; assertions below scope to intent, not exact length.
  return pageSource.slice(start, start + 3200);
}

test("single delete removes the item and all descendants locally, no full reload", () => {
  const handler = sliceHandler("const handleDeleteTask = useCallback(");
  assert.match(handler, /const removed = new Set<string>\(\[itemId\]\);/);
  assert.match(handler, /while \(changed\)/);
  assert.match(handler, /removed\.has\(item\.parentId\)/);
  assert.match(handler, /return current\.filter\(\(item\) => !removed\.has\(item\.id\)\);/);
  assert.match(handler, /setDashboardRefreshToken\(\(current\) => current \+ 1\);/);
  // Delete no longer reloads the whole event.
  assert.doesNotMatch(handler, /await loadItems\(/);
});

test("inline create inserts the returned record locally instead of reloading", () => {
  // Scoped to the inline-draft save path.
  const handler = sliceHandler("const createdItem = responsePayload as TimelineItemRecord;");
  assert.match(handler, /setItems\(\(current\) => \[\.\.\.current, createdItem\]\);/);
  assert.match(handler, /setDashboardRefreshToken\(\(current\) => current \+ 1\);/);
  assert.match(handler, /setInlineDraft\(null\);/);
  assert.doesNotMatch(handler, /await loadItems\(/);
  assert.doesNotMatch(handler, /router\.refresh\(\)/);
});

test("bulk update applies the selected patch locally and invalidates the dashboard", () => {
  const handler = sliceHandler("const handleBulkUpdateItems = useCallback(");
  assert.match(handler, /setItems\(\(current\) =>/);
  assert.match(handler, /current\.map\(\(item\) =>/);
  assert.match(handler, /if \(!selectedIds\.has\(item\.id\)\) return item;/);
  assert.doesNotMatch(handler, /await loadItems\(selectedEventId\);/);
  assert.doesNotMatch(handler, /router\.refresh\(\)/);
  assert.match(handler, /setDashboardRefreshToken\(\(current\) => current \+ 1\);/);
});

test("bulk delete keeps a full reload and invalidates the dashboard", () => {
  const handler = sliceHandler("const handleBulkDeleteItems = useCallback(");
  assert.match(handler, /await loadItems\(selectedEventId\);/);
  assert.match(handler, /setDashboardRefreshToken\(\(current\) => current \+ 1\);/);
});

test("import keeps a full reload (mass create) and invalidates the dashboard", () => {
  const handler = sliceHandler("Failed to import timeline items");
  assert.match(handler, /await loadItems\(selectedEventId\);/);
  assert.match(handler, /setDashboardRefreshToken\(\(current\) => current \+ 1\);/);
});

test("targeted updates only apply server-confirmed writes (no fake success before response)", () => {
  // Delete mutates local state only after the ok check throws on failure.
  const del = sliceHandler("const handleDeleteTask = useCallback(");
  assert.ok(
    del.indexOf("if (!response.ok)") < del.indexOf("current.filter((item) => !removed.has(item.id))"),
    "delete must confirm server success before removing rows",
  );
});
