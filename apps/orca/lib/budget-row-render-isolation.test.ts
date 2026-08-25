import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Render isolation coverage for the extracted BudgetRow (B9).
//
// The Budget grid is a client component that is not rendered in the node --test
// runner (no jsdom/RTL harness in this repo), so a true render-count assertion is
// not practical here. Instead we lock the structural contract that makes row-level
// render isolation possible, and document the manual render-count QA below.
//
// Manual QA (React DevTools Profiler): with "Highlight updates" on, type into one
// row's forecast/actual cell and confirm only that row (and header/footer totals)
// flashes — other visible rows must not re-render. Toggling one row's selection
// likewise must not re-render every row.

const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

test("BudgetRow is a memoized component boundary", () => {
  assert.equal(gridSource.includes("const BudgetRow = memo(function BudgetRow("), true);
  // The group cell is also memoized so its subtree does not churn.
  assert.equal(gridSource.includes("const BudgetGroupSelectCell = memo(function BudgetGroupSelectCell("), true);
});

test("each row receives only its own draft, not the whole draft maps", () => {
  // Passing amountDrafts[id] / lineItemDrafts[id] means only the edited row's
  // draft prop changes on a keystroke, so React.memo skips the other rows.
  assert.equal(gridSource.includes("amountDraft={amountDrafts[item.id]}"), true);
  assert.equal(gridSource.includes("textDraft={lineItemDrafts[item.id]}"), true);
  // The whole maps are NOT passed to each row.
  assert.equal(gridSource.includes("amountDrafts={amountDrafts}\n"), false);
  assert.equal(gridSource.includes("lineItemDrafts={lineItemDrafts}\n"), false);
});

test("row state is passed as per-row primitives, not changing collections", () => {
  assert.equal(gridSource.includes("selected={selectedLineItemIds.includes(item.id)}"), true);
  assert.equal(gridSource.includes("locked={isLineItemLocked(item.id)}"), true);
  assert.equal(gridSource.includes("readOnly={isLineItemReadOnly(item)}"), true);
  assert.equal(gridSource.includes("isNew={isTemporaryLineItemId(item.id)}"), true);
  assert.equal(gridSource.includes("isDirty={dirtyLineItemIds.has(item.id)}"), true);
  assert.equal(gridSource.includes("isSaved={savedLineItemIds.has(item.id)}"), true);
  assert.equal(gridSource.includes("error={rowErrors[item.id] ?? null}"), true);
  assert.equal(gridSource.includes("approvalState={resolveLineItemApprovalState(item, submissionThreads.get(item.id))}"), true);
});

test("draft/dirty/save state stays parent-owned (survives row unmount under pagination)", () => {
  // Drafts and dirty/saved/error state are declared in the parent grid, never
  // inside BudgetRow, so a row unmounting (paging away) never drops unsaved edits.
  assert.equal(gridSource.includes("const [amountDrafts, setAmountDrafts] = useState<Record<string, AmountDraft>>({});"), true);
  assert.equal(gridSource.includes("const [lineItemDrafts, setLineItemDrafts] = useState<Record<string, LineItemTextDraft>>({});"), true);
  // BudgetRow receives the setters as props (does not own draft state).
  assert.equal(gridSource.includes("setAmountDrafts={setAmountDrafts}"), true);
  assert.equal(gridSource.includes("setLineItemDrafts={setLineItemDrafts}"), true);
  // The BudgetRow component body must not declare its own draft useState.
  const rowStart = gridSource.indexOf("const BudgetRow = memo(function BudgetRow(");
  const rowEnd = gridSource.indexOf("export function FullBudgetGrid(");
  const rowBody = gridSource.slice(rowStart, rowEnd);
  assert.equal(rowBody.includes("useState"), false, "BudgetRow must not own local state");
});

test("row receives stable callbacks from the parent", () => {
  assert.equal(gridSource.includes("onRowClick={handleLineItemRowClick}"), true);
  assert.equal(gridSource.includes("onToggleSelect={toggleLineItemSelection}"), true);
  assert.equal(gridSource.includes("onMarkDirty={markLineItemDirty}"), true);
  assert.equal(gridSource.includes("onAmountBlur={updateAmount}"), true);
  assert.equal(gridSource.includes("onFieldCommit={updateLineItemField}"), true);
  assert.equal(gridSource.includes("onAssignSession={handleAssignSession}"), true);
  assert.equal(gridSource.includes("onAssignGroup={handleAssignGroup}"), true);
  assert.equal(gridSource.includes("onDeleteGroup={handleDeleteGroup}"), true);
  assert.equal(gridSource.includes("onOpenApproval={openApprovalDrawerForLineItem}"), true);
  assert.equal(gridSource.includes("registerForecastInput={registerForecastInput}"), true);
  assert.equal(gridSource.includes("registerCategorySelect={registerCategorySelect}"), true);
  // Stable group callbacks are passed straight through to the memoized group cell.
  assert.equal(gridSource.includes("onAssign={onAssignGroup}"), true);
  assert.equal(gridSource.includes("onDelete={onDeleteGroup}"), true);
});
