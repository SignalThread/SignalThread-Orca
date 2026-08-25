import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { computeOverlayTotals, type OverlayCommittedBase } from "@/lib/budget-overlay-totals";

// A test stand-in for the grid's parseCurrencyToCents: dollars string -> cents,
// empty/invalid -> null (zero delta).
function parse(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

const base = { totalForecastCents: 10_000, totalActualCents: 5_000 };

// Prompt 7: global optimistic totals = server-authoritative committed totals +
// dirty-overlay deltas. These lock the core rule: never a reduce over the loaded
// page; a dirty row moves the header totals via its captured committed base.
test("no dirty rows => totals equal the server committed base", () => {
  const totals = computeOverlayTotals(base, {}, {}, parse);
  assert.equal(totals.totalForecastCents, 10_000);
  assert.equal(totals.totalActualCents, 5_000);
  assert.equal(totals.varianceCents, -5_000);
});

test("editing a row updates the global total by its delta", () => {
  const overlay: Record<string, OverlayCommittedBase> = {
    r1: { committedForecastCents: 1_000, committedActualCents: 500 },
  };
  const drafts = { r1: { forecast: "20.00", actual: "5.00" } };
  const totals = computeOverlayTotals(base, overlay, drafts, parse);
  // forecast: 10000 + (2000 - 1000) = 11000; actual: 5000 + (500 - 500) = 5000.
  assert.equal(totals.totalForecastCents, 11_000);
  assert.equal(totals.totalActualCents, 5_000);
});

test("a dirty row that is no longer loaded (paged away) still moves the total", () => {
  // The helper never sees loaded rows — only the committed base (full budget) and
  // the overlay. So an off-page dirty row contributes exactly as an on-page one.
  const overlay: Record<string, OverlayCommittedBase> = {
    offPage: { committedForecastCents: 3_000, committedActualCents: 3_000 },
  };
  const drafts = { offPage: { forecast: "50.00", actual: "30.00" } };
  const totals = computeOverlayTotals(base, overlay, drafts, parse);
  // forecast: 10000 + (5000 - 3000) = 12000; actual: 5000 + (3000 - 3000) = 5000.
  assert.equal(totals.totalForecastCents, 12_000);
  assert.equal(totals.totalActualCents, 5_000);
});

test("an empty draft field is a zero delta (committed value stands)", () => {
  const overlay: Record<string, OverlayCommittedBase> = {
    r1: { committedForecastCents: 1_000, committedActualCents: 500 },
  };
  const drafts = { r1: { forecast: "", actual: "7.50" } };
  const totals = computeOverlayTotals(base, overlay, drafts, parse);
  // forecast unchanged (empty draft); actual: 5000 + (750 - 500) = 5250.
  assert.equal(totals.totalForecastCents, 10_000);
  assert.equal(totals.totalActualCents, 5_250);
});

test("discarding (empty overlay) reconciles back to the committed base", () => {
  // Simulates discard/refetch clearing the overlay: deltas vanish.
  const totals = computeOverlayTotals(base, {}, { r1: { forecast: "99.99", actual: "99.99" } }, parse);
  assert.equal(totals.totalForecastCents, 10_000);
  assert.equal(totals.totalActualCents, 5_000);
});

test("variance and percentUnder are derived from the optimistic totals", () => {
  const overlay: Record<string, OverlayCommittedBase> = {
    r1: { committedForecastCents: 0, committedActualCents: 0 },
  };
  const drafts = { r1: { forecast: "100.00", actual: "40.00" } };
  const totals = computeOverlayTotals({ totalForecastCents: 0, totalActualCents: 0 }, overlay, drafts, parse);
  assert.equal(totals.totalForecastCents, 10_000);
  assert.equal(totals.totalActualCents, 4_000);
  assert.equal(totals.varianceCents, -6_000);
  assert.equal(totals.percentUnder, 60);
});

// Grid wiring: the overlay must be parent-owned, captured once per dirty row, and
// cleared on save/discard/refetch. Locks the lifecycle so drafts survive paging.
const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

test("dirty overlay is parent-owned and never lives in BudgetRow", () => {
  assert.equal(gridSource.includes("const [dirtyOverlay, setDirtyOverlay] = useState<Record<string, DirtyOverlayEntry>>({});"), true);
  // Captured lazily via a ref so markLineItemDirty stays a stable, dep-free callback.
  assert.equal(gridSource.includes("committedLineItemsByIdRef.current.get(lineItemId)"), true);
  // The BudgetRow body must not own overlay state.
  const rowStart = gridSource.indexOf("const BudgetRow = memo(function BudgetRow(");
  const rowEnd = gridSource.indexOf("export function FullBudgetGrid(");
  assert.equal(gridSource.slice(rowStart, rowEnd).includes("dirtyOverlay"), false);
});

test("overlay is cleared on save-row, discard-all, and refetch", () => {
  // Per-row clear (save success / cancel) drops the overlay entry.
  assert.match(gridSource, /setDirtyOverlay\(\(current\) => \{\s*if \(!current\[lineItemId\]\) return current;/);
  // Full resets (refetch load + cancel-edit) clear the whole overlay.
  assert.equal(gridSource.includes("setDirtyOverlay({});"), true);
});

test("save-all and discard-all reach off-page dirty rows via the overlay", () => {
  assert.equal(gridSource.includes("?? dirtyOverlay[lineItemId]?.committedItem"), true);
});
