import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Prompt 8: the Budget grid loads a light snapshot + a server page instead of the
// full line-item universe. These lock the data-flow contract (the grid is a client
// component with no render harness in this repo, so we assert the wiring).
const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

test("default page size is 10", () => {
  assert.equal(gridSource.includes("const LINE_ITEMS_DEFAULT_PAGE_SIZE = 10;"), true);
});

test("first load fetches the light snapshot (no full line-item array)", () => {
  // loadBudget requests the shell without rows; the page endpoint ships the rows.
  assert.match(gridSource, /includeLineItems: "0"/);
});

test("current page rows come from the paged line-items endpoint", () => {
  assert.match(gridSource, /\/api\/events\/\$\{selectedEventId\}\/budget\/line-items\?\$\{params\.toString\(\)\}/);
  assert.match(gridSource, /setPagedLineItems\(result\.rows\)/);
  assert.match(gridSource, /setPagedFilteredCount\(result\.filteredCount\)/);
  assert.match(gridSource, /setPagedFooterTotals\(result\.filteredFooterTotals\)/);
});

test("filters and search are sent to the server (search is debounced)", () => {
  assert.match(gridSource, /params\.set\("category", lineItemsFilterCategory\.trim\(\)\)/);
  assert.match(gridSource, /params\.set\("status", lineItemsFilterStatus\)/);
  assert.match(gridSource, /params\.set\("approval", lineItemsFilterApproval\)/);
  assert.match(gridSource, /params\.set\("sessionId", lineItemsFilterSession\.trim\(\)\)/);
  assert.match(gridSource, /params\.set\("groupId", lineItemsFilterGroup\.trim\(\)\)/);
  // Debounced search value drives both the fetch and the page reset.
  assert.match(gridSource, /setDebouncedLineItemsSearch\(lineItemsSearch\)/);
  assert.match(gridSource, /params\.set\("search", debouncedLineItemsSearch\.trim\(\)\)/);
});

test("sort controls are user-facing and server-backed", () => {
  assert.match(gridSource, /const handleToggleSort = useCallback/);
  assert.match(gridSource, /renderSortableHeader\("Category", "category", "category"\)/);
  assert.match(gridSource, /renderSortableHeader\("Forecast", "forecastCents"(?:, [^)]+)?\)/);
  assert.match(gridSource, /renderSortableHeader\("Actual", "actualCents"(?:, [^)]+)?\)/);
  assert.match(gridSource, /params\.set\("sort", lineItemsSort\)/);
  assert.match(gridSource, /params\.set\("dir", lineItemsSortDir\)/);
});

test("pagination uses the server filtered count, not the loaded page length", () => {
  assert.match(gridSource, /const lineItemsFilteredCount = pagedFilteredCount;/);
});

test("header/global totals stay global (snapshot totals + overlay), never page-only", () => {
  // Base is the snapshot's authoritative full-budget totals, not a reduce of rows.
  assert.match(gridSource, /totalForecastCents: budgetData\?\.totals\.totalForecastCents \?\? 0/);
  assert.match(gridSource, /computeOverlayTotals\(committedTotalsBase, dirtyOverlay, amountDrafts, parseCurrencyToCents\)/);
});

test("stale paged responses are discarded via a monotonic request token", () => {
  assert.match(gridSource, /const requestToken = \+\+lineItemsPageRequestRef\.current;/);
  assert.match(gridSource, /if \(requestToken !== lineItemsPageRequestRef\.current\) return;/);
});

test("a committed mutation reconciles both the page and the authoritative totals", () => {
  assert.match(gridSource, /const reconcileBudgetAfterMutation = useCallback/);
  assert.match(gridSource, /refreshBudgetLineItemsPage\(\)/);
  assert.match(gridSource, /const eventId = selectedEventIdRef\.current;[\s\S]*refreshBudgetShellTotals\(eventId\)/);
  // Save-all reconciles once for the whole batch.
  assert.match(gridSource, /reconcileBudgetAfterMutation\(\);\s*\n\s*if \(failedCount > 0\)/);
});

// --- Prompt 9: bulk selection modes + export options -----------------------

test("bulk select supports current page, all filtered, and all rows", () => {
  // Current page toggle (existing).
  assert.match(gridSource, /function toggleSelectAllLineItems\(\)/);
  // All filtered / all rows via the ids-only endpoint (across pages, ID-based).
  assert.match(gridSource, /async function handleSelectAllFilteredLineItems\(\)/);
  assert.match(gridSource, /\/budget\/line-items\/ids\?\$\{buildLineItemFilterParams\(\)\.toString\(\)\}/);
  // Locked/temporary rows excluded from the bulk selection.
  assert.match(gridSource, /!isLineItemLocked\(id\) && !isTemporaryLineItemId\(id\)/);
  // The affordance names the two modes distinctly.
  assert.match(gridSource, /Select all \$\{pagedFilteredCount\} filtered/);
  assert.match(gridSource, /Select all \$\{pagedFilteredCount\} rows/);
});

test("export supports full Budget and current filtered view", () => {
  // Full export (no filter params).
  assert.match(gridSource, /handleExportBudgetCsv\("line-items"\)/);
  // Filtered export reuses the shared filter params and flags filtered=1.
  assert.match(gridSource, /handleExportBudgetCsv\("line-items", \{ filtered: true \}\)/);
  assert.match(gridSource, /params\.set\("filtered", "1"\)/);
  assert.match(gridSource, /Export Filtered View/);
});

// The paged fetch, ids-only fetch, and filtered export all derive their query
// from ONE helper, so "the current filtered view" is defined in exactly one place.
test("filter params come from a single shared builder", () => {
  assert.match(gridSource, /const buildLineItemFilterParams = useCallback/);
});
