// Phase 2 Budget import QA: write path (no P2028 timeout) + UI behavior.
// The budget service module carries heavy server deps, so — matching the
// established convention in budget-access-hardening-regression — the write
// path is asserted via source inspection. The pure create-data builder is also
// imported and exercised with a realistic 78-row batch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildBudgetImportCreateData } from "@/src/server/services/budget";

const budgetServiceSource = readFileSync("src/server/services/budget.ts", "utf8");
const importRouteSource = readFileSync("app/api/events/[eventId]/budget/import/route.ts", "utf8");
const importActionSource = readFileSync("app/(shell)/budgets/_components/budget-import-action.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

// --- Write path: realistic 78-row batch builds one bulk insert, preserving order ---

test("buildBudgetImportCreateData prepares a contiguous 78-row batch with preserved sortOrder", () => {
  const rows = Array.from({ length: 78 }, (_, index) => ({
    category: `Category ${index % 5}`,
    subcategory: index % 2 === 0 ? `Sub ${index}` : undefined,
    lineItem: `Line ${index}`,
    forecastCents: 1000 + index,
    actualCents: index,
    status: undefined,
  }));

  const baseSortOrder = 12;
  const data = buildBudgetImportCreateData("budget-1", rows, baseSortOrder);

  assert.equal(data.length, 78);
  // sortOrder is contiguous and preserves input order.
  assert.equal(data[0].sortOrder, baseSortOrder + 1);
  assert.equal(data[77].sortOrder, baseSortOrder + 78);
  assert.deepEqual(
    data.map((row) => row.sortOrder),
    rows.map((_, index) => baseSortOrder + index + 1),
  );
  // Defaults are applied without a DB round-trip.
  assert.equal(data[1].subcategory, "General"); // odd index -> undefined -> "General"
  assert.equal(data[0].status, "PLANNED");
  assert.equal(data[0].budgetId, "budget-1");
});

test("importLineItems uses chunked createMany, not one create() per row in a transaction", () => {
  const fn = sourceBetween(
    budgetServiceSource,
    "export async function importLineItems",
    "export async function updateLineItem",
  );

  // The fix: a bulk insert.
  assert.ok(fn.includes("createMany"), "importLineItems must use createMany");
  assert.ok(fn.includes("BUDGET_IMPORT_CHUNK_SIZE"), "imports should be chunked");

  // The regression: must NOT map input rows to per-row create() calls inside a
  // single interactive transaction (the P2028 timeout pattern).
  assert.ok(
    !/\$transaction\(\s*inputRows\.map/.test(fn),
    "must not run one create() per row inside $transaction",
  );
  assert.ok(!/inputRows\.map\([^)]*create\(/.test(fn), "no per-row create() over inputRows");
});

test("budget import route keeps event-scoped write auth and server-side re-validation", () => {
  // Authorization (write) is enforced before any work.
  assert.ok(importRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'));
  // The server re-validates every row regardless of the client mapping.
  assert.ok(importRouteSource.includes("validateBudgetImportRows("));
  // Partial success preserved: imports valid rows, reports skipped.
  assert.ok(importRouteSource.includes("validation.validRows"));
  assert.ok(importRouteSource.includes("user: auth.user"));
  const fn = sourceBetween(budgetServiceSource, "export async function importLineItems", "export async function updateLineItem");
  assert.ok(fn.includes('assertBudgetAccessForEvent(eventId, options.user, "write")'));
});

// --- UI behavior ---

test("preview table renders the required mapped Line Item value", () => {
  const tbody = sourceBetween(importActionSource, "importRowsForPreviewPage.map", "importRowsForPreview.length === 0");
  // Canonical line item plus the source-mapped columns.
  assert.ok(tbody.includes("row.normalized?.lineItem"));
  assert.equal(tbody.includes("from Subcategory"), false);
  for (const cell of ["row.raw.Category", "row.raw.Subcategory", "row.raw.Vendor", "row.raw.Forecast", "row.raw.Actual"]) {
    assert.ok(tbody.includes(cell), `preview should render ${cell}`);
  }
});

test("multi-sheet workbook shows one-sheet-at-a-time copy and never merges sheets", () => {
  assert.ok(importActionSource.includes("Import one sheet at a time. Each sheet can have its own mapping."));
  assert.ok(importActionSource.includes("Sheets are never merged."));
});

test("Notes detection drives one top-level notice, not a mapping target", () => {
  assert.ok(importActionSource.includes("detectNotesColumns"));
  assert.ok(
    importActionSource.includes("Notes were detected but won&apos;t be imported yet."),
  );
  assert.equal(importActionSource.includes("Budget Files"), false);
});

test("warnings card is driven by the de-noised warning count only", () => {
  // The card reads importWarningCount, which sums only real row warnings.
  assert.ok(importActionSource.includes("{importWarningCount}"));
  assert.equal(importActionSource.includes("importLineItemFallbackCount"), false);
});

test("budget import empty state hides summary cards and preview table before upload", () => {
  assert.ok(importActionSource.includes("compact={!hasImportFileSelection}"));
  assert.ok(importActionSource.includes("Download Template (optional)"));
  assert.ok(importActionSource.includes("Choose File"));
  assert.ok(importActionSource.includes("!hasImportFileSelection ? ("));
  const emptyState = sourceBetween(importActionSource, "!hasImportFileSelection ? (", ") : (");
  assert.ok(!emptyState.includes("Parsed rows"));
  assert.ok(!emptyState.includes("<table"));
});

test("budget import summary cards and preview table render only after a sheet is available", () => {
  const uploadedState = sourceBetween(importActionSource, "{importSheet ? (", ") : null}");
  assert.ok(uploadedState.includes("Parsed rows"));
  assert.ok(uploadedState.includes("Valid rows"));
  assert.ok(uploadedState.includes("<table"));
});
