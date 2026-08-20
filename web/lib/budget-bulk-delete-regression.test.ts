// Budget bulk-delete performance fix.
//
// Selected-row delete previously fired one DELETE request per row (slow). The
// fix adds a single scoped bulk-delete path. The budget service carries heavy
// server deps, so — matching budget-import-write-regression — the DB round-trip
// is asserted via source inspection while the pure decision logic (id
// normalization, scope classification, partial-success counts) is imported and
// exercised directly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BudgetServiceError,
  buildBulkDeleteResult,
  classifyBulkDeleteIds,
  normalizeBulkDeleteIds,
} from "@/src/server/services/budget";

const serviceSource = readFileSync("src/server/services/budget.ts", "utf8");
const collectionRouteSource = readFileSync(
  "app/api/events/[eventId]/budget/line-items/route.ts",
  "utf8",
);
const singleRouteSource = readFileSync(
  "app/api/events/[eventId]/budget/line-items/[id]/route.ts",
  "utf8",
);
const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

// --- Pure logic: id normalization ---

test("normalizeBulkDeleteIds dedupes, trims, and drops blanks", () => {
  assert.deepEqual(normalizeBulkDeleteIds([" a ", "a", "b", "", "  "]), ["a", "b"]);
});

test("normalizeBulkDeleteIds rejects non-arrays and empty selections", () => {
  assert.throws(() => normalizeBulkDeleteIds("a"), (error: unknown) => {
    return error instanceof BudgetServiceError && error.status === 400;
  });
  assert.throws(() => normalizeBulkDeleteIds([]), (error: unknown) => {
    return error instanceof BudgetServiceError && error.status === 400;
  });
  assert.throws(() => normalizeBulkDeleteIds(["", "   "]), (error: unknown) => {
    return error instanceof BudgetServiceError && error.status === 400;
  });
});

// --- Pure logic: scope classification ---

test("classifyBulkDeleteIds partitions owned, foreign, and stale ids", () => {
  const requested = ["own-1", "own-2", "foreign-1", "stale-1"];
  const found = [
    { id: "own-1", budgetId: "budget-1" },
    { id: "own-2", budgetId: "budget-1" },
    { id: "foreign-1", budgetId: "budget-2" },
  ];
  const result = classifyBulkDeleteIds(requested, found, "budget-1");

  assert.deepEqual(result.ownedIds, ["own-1", "own-2"]);
  assert.deepEqual(result.foreignIds, ["foreign-1"]);
  assert.deepEqual(result.staleIds, ["stale-1"]);
});

test("classifyBulkDeleteIds reports stale ids when nothing is found", () => {
  const result = classifyBulkDeleteIds(["a", "b"], [], "budget-1");
  assert.deepEqual(result.ownedIds, []);
  assert.deepEqual(result.foreignIds, []);
  assert.deepEqual(result.staleIds, ["a", "b"]);
});

// --- Pure logic: result/partial-success counts ---

test("buildBulkDeleteResult reports deleted and skipped counts", () => {
  const result = buildBulkDeleteResult(["a", "b"], [], 2);
  assert.equal(result.deletedCount, 2);
  assert.equal(result.skippedCount, 0);
  assert.deepEqual(result.skippedIds, []);
});

test("stale ids are partial success (deleted some, skipped the rest)", () => {
  // 77 deleted, 1 stale -> the "Deleted 77; 1 already gone" case.
  const owned = Array.from({ length: 77 }, (_, index) => `own-${index}`);
  const result = buildBulkDeleteResult(owned, ["stale-1"], 77);
  assert.equal(result.deletedCount, 77);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.skippedIds, ["stale-1"]);
});

test("owned ids the DB did not remove (race) also count as skipped", () => {
  // Asked to delete 3 owned, but only 2 rows existed at delete time.
  const result = buildBulkDeleteResult(["a", "b", "c"], [], 2);
  assert.equal(result.deletedCount, 2);
  assert.equal(result.skippedCount, 1);
});

test("a fully stale batch is success with zero deleted (idempotent)", () => {
  const result = buildBulkDeleteResult([], ["x", "y"], 0);
  assert.equal(result.deletedCount, 0);
  assert.equal(result.skippedCount, 2);
});

// --- Service wiring: scoped single deleteMany, write-gated, no faked success ---

test("deleteLineItems enforces edit-lock, scopes to the budget, and confirms DB delete", () => {
  const fn = sourceBetween(
    serviceSource,
    "export async function deleteLineItems",
    "export type BudgetSubmissionSummary",
  );

  // Budget must be editable (not APPROVED).
  assert.ok(fn.includes("assertBudgetEditable(budget)"));
  // Cross-scope ids reject the whole request.
  assert.ok(fn.includes("foreignIds.length > 0"));
  assert.ok(fn.includes("do not belong to this budget"));
  // One scoped bulk delete, not a per-row loop.
  assert.ok(fn.includes("deleteMany"));
  assert.ok(fn.includes("budgetId: budget.id"));
  assert.ok(!/for \(const .* of /.test(fn), "must not loop per-row deletes");
  // Success count comes from the DB result, never faked. The delete + audit
  // entry commit atomically, so the count is returned from the transaction.
  assert.ok(fn.includes("return result.count"));
});

// --- Route wiring: bulk DELETE is write-gated; single-row DELETE still exists ---

test("bulk DELETE route exists, requires write access, and delegates to deleteLineItems", () => {
  assert.ok(collectionRouteSource.includes("deleteLineItems"));
  assert.ok(collectionRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'));
  assert.ok(collectionRouteSource.includes("deleteLineItems(eventId, body.ids, auth.user)"));
  assert.ok(
    collectionRouteSource.includes(
      'export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/budget/line-items", deleteHandler);',
    ),
  );
});

test("the existing single-row DELETE route is preserved", () => {
  assert.ok(singleRouteSource.includes("deleteLineItem(eventId, id, auth.user)"));
  assert.ok(
    singleRouteSource.includes(
      'export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/budget/line-items/:id", deleteHandler);',
    ),
  );
});

// --- Client: one bulk request, deleted IDs cleared, grid reconciled, button locked ---

test("selected-row delete makes one bulk call, not one request per row", () => {
  const fn = sourceBetween(
    gridSource,
    "async function handleDeleteSelectedLineItems",
    "async function handleExportBudgetCsv",
  );

  // Single bulk DELETE to the collection route with an ids payload.
  assert.equal((fn.match(/await fetch\(/g) ?? []).length, 1, "must make exactly one delete request");
  assert.ok(fn.includes('method: "DELETE"'));
  assert.ok(fn.includes("/budget/line-items`"));
  assert.ok(fn.includes("JSON.stringify({ ids: idsToDelete })"));
  // The old per-row loop is gone.
  assert.ok(
    !/for \(const lineItemId of selectedLineItemIds\)/.test(fn),
    "must not loop a DELETE per selected row",
  );
  // Delete removes the affected rows locally and does the lightweight page/totals
  // reconciliation instead of a disruptive full loadBudget reset.
  assert.ok(fn.includes("setPagedLineItems((current) => current.filter"));
  assert.ok(fn.includes("setSelectedLineItemIds((current) => current.filter"));
  assert.ok(fn.includes("reconcileBudgetAfterMutation()"));
  assert.equal(fn.includes("await loadBudget(selectedEventId"), false);
  // Feedback surfaces deleted/skipped counts.
  assert.ok(fn.includes("Deleted ${deletedCount} line item"));
  assert.ok(fn.includes("already gone"));
});

test("delete button is disabled while a mutation is in flight", () => {
  // canDeleteSelected blocks while isMutating to prevent duplicate submissions.
  assert.ok(gridSource.includes("isMutating\n          ? \"Working...\""));
});
