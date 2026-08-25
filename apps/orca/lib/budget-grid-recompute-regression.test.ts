import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

// B3 regression: a keystroke must not re-reduce/remap the whole line-item set.
test("budget totals are computed from a committed base plus draft deltas", () => {
  // Committed base sums and lookup are memoized on lineItems only (stable while typing).
  assert.equal(gridSource.includes("const committedTotalsBase = useMemo("), true);
  assert.equal(gridSource.includes("const committedLineItemsById = useMemo("), true);
  // Totals apply dirty-overlay deltas over the touched rows only, not a full reduce.
  // (B/Prompt 7: the delta loop lives in the pure computeOverlayTotals lib; the
  // grid calls it with the committed base + overlay + drafts.)
  assert.equal(gridSource.includes("computeOverlayTotals(committedTotalsBase, dirtyOverlay, amountDrafts, parseCurrencyToCents)"), true);
  assert.equal(gridSource.includes('import { computeOverlayTotals } from "@/lib/budget-overlay-totals"'), true);
  // The shared finalization math (variance/percentUnder) lives in the pure lib.
  const overlaySource = readFileSync("lib/budget-overlay-totals.ts", "utf8");
  assert.equal(overlaySource.includes("export function finalizeOverlayTotals("), true);
  assert.equal(overlaySource.includes("return finalizeOverlayTotals(totalForecastCents, totalActualCents)"), true);
  // The old full-set optimistic remap and grid-local totals helpers are gone.
  assert.equal(gridSource.includes("const optimisticLineItems = useMemo("), false);
  assert.equal(gridSource.includes("const optimisticLineItemsById = useMemo("), false);
  assert.equal(gridSource.includes("function computeBudgetTotals("), false);
  assert.equal(gridSource.includes("function finalizeBudgetTotals("), false);
});

// B3: optimistic amounts are applied lazily only where rendered.
test("optimistic amounts are applied per rendered row, not across the whole set", () => {
  // The memoized BudgetRow applies only its own row's draft (not the whole set).
  assert.equal(gridSource.includes("const optimisticItem = applyOptimisticAmounts(item, { [item.id]: draft });"), true);
  // The open detail row applies the draft for its single item.
  assert.equal(gridSource.includes("? applyOptimisticAmounts(selectedLineItem, amountDrafts)"), true);
});

// B8 regression: derived collections are memoized instead of rebuilt every render.
test("derived grid collections are memoized with narrow dependencies", () => {
  assert.equal(gridSource.includes("const lockedLineItemIds = useMemo("), true);
  assert.equal(gridSource.includes("const selectableFilteredLineItemIds = useMemo("), true);
  // Prompt 8: the displayed page IS the server response for the current page, so
  // there is no client-side slice; paginatedLineItems is the filtered page.
  assert.equal(gridSource.includes("const paginatedLineItems = filteredLineItems;"), true);
  // The old in-render-body Set construction is gone.
  assert.equal(gridSource.includes("const lockedLineItemIds = new Set<string>("), false);
});
