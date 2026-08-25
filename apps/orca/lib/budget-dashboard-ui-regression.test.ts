import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventBudgetPageSource = readFileSync("app/(shell)/events/[eventId]/budget/page.tsx", "utf8");
const dashboardSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-dashboard.tsx", "utf8");
const budgetBlocksSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-blocks-section.tsx", "utf8");
const pageHeaderSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-page-header.tsx", "utf8");
const viewSwitchSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-view-switch.tsx", "utf8");
const globalBudgetPageSource = readFileSync("app/(shell)/budgets/page.tsx", "utf8");
const fullBudgetGridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const budgetImportActionSource = readFileSync("app/(shell)/budgets/_components/budget-import-action.tsx", "utf8");

test("event budget route defaults to the dashboard command center", () => {
  assert.equal(eventBudgetPageSource.includes('activeView = firstSearchParam(resolvedSearchParams.view) === "grid" ? "grid" : "dashboard"'), true);
  assert.equal(eventBudgetPageSource.includes('if (activeView === "grid")'), true);
  assert.equal(eventBudgetPageSource.includes("return <BudgetDashboard eventId={eventId} />;"), true);
});

test("event budget grid view renders FullBudgetGrid through view=grid", () => {
  assert.equal(eventBudgetPageSource.includes("<BudgetPageHeader"), true);
  assert.equal(eventBudgetPageSource.includes('activeView="grid"'), true);
  assert.equal(eventBudgetPageSource.includes("<FullBudgetGrid eventIdOverride={eventId} hideEventSelector />"), true);
  assert.equal(viewSwitchSource.includes("budget?view=grid"), true);
  assert.equal(viewSwitchSource.includes("Command Center"), true);
  assert.equal(viewSwitchSource.includes("Full Budget Grid"), true);
});

test("budget dashboard fetches the read-only dashboard API", () => {
  assert.equal(dashboardSource.includes("fetch(`/api/events/${eventId}/budget/dashboard`, { cache: \"no-store\" })"), true);
  assert.equal(dashboardSource.includes("BudgetDashboardResponse"), true);
  assert.equal(dashboardSource.includes("<BudgetPageHeader"), true);
  assert.equal(dashboardSource.includes('activeView="dashboard"'), true);
});

test("budget views share a stable page header shell", () => {
  assert.equal(pageHeaderSource.includes("<EventModuleHeader"), true);
  assert.equal(pageHeaderSource.includes("<BudgetViewSwitch eventId={eventId} activeView={activeView} />"), true);
  assert.equal(pageHeaderSource.includes('badge={activeView === "dashboard" ? "Command Center" : undefined}'), true);
  assert.equal(eventBudgetPageSource.includes('title="Full Budget Grid"'), true);
  assert.equal(dashboardSource.includes('title="Budget"'), true);
  assert.equal(dashboardSource.includes('title="Budget Command Center"'), false);
  assert.equal(viewSwitchSource.includes("EVENT_MODULE_PRIMARY_CLASS"), true);
  assert.equal(viewSwitchSource.includes("bg-slate-900"), false);
});

test("budget command center exposes the shared import action and reloads after import", () => {
  assert.equal(dashboardSource.includes("<BudgetImportAction"), true);
  assert.equal(dashboardSource.includes('eventId={eventId}'), true);
  assert.equal(dashboardSource.includes("onImported={async () => {"), true);
  assert.equal(dashboardSource.includes("await loadDashboard();"), true);
  assert.equal(dashboardSource.includes("<Upload className=\"h-3.5 w-3.5\" />"), true);
  assert.equal(dashboardSource.includes("Import"), true);
});

test("budget command center exposes retry only for load failures, not a persistent refresh action", () => {
  assert.equal(dashboardSource.includes("RefreshCw"), true);
  assert.equal(dashboardSource.includes("Retry"), true);
  assert.equal(dashboardSource.includes(">Refresh<"), false);
  assert.equal(dashboardSource.includes("isRefreshing"), false);
  assert.equal(dashboardSource.includes('loadDashboard("refresh")'), false);
});

test("budget command center keeps the shared budget task launcher behind the generic tasking flag", () => {
  assert.equal(dashboardSource.includes("FEATURES.ENABLE_GENERIC_TASKING_UI ? ("), true);
  assert.equal(dashboardSource.includes("<TaskCreateLauncher"), true);
  assert.equal(dashboardSource.includes('source="budget"'), true);
  assert.equal(dashboardSource.includes('objectType: "BUDGET_LINE_ITEM"'), true);
  assert.equal(dashboardSource.includes("loadBudgetTaskAttachmentOptions"), true);
});

test("redundant full-width CTA bar is removed from the budget dashboard", () => {
  // The standalone "Need the complete line-by-line budget?" bar added no value.
  assert.equal(dashboardSource.includes("Need the complete line-by-line budget?"), false);
  assert.equal(
    dashboardSource.includes("Open the grid for filters, exports, approvals, files, and row-level detail."),
    false,
  );
});

test("full budget grid navigation is preserved elsewhere on the dashboard", () => {
  // The grid href and at least one persistent affordance remain.
  assert.equal(dashboardSource.includes('const gridHref = `/events/${encodeURIComponent(eventId)}/budget?view=grid`;'), true);
  assert.equal(dashboardSource.includes("href={gridHref}"), true);
  assert.equal(dashboardSource.includes("Add line item"), true);
});

test("budget dashboard KPI cards render the compact financial metrics", () => {
  assert.equal(dashboardSource.includes('label="Total Forecast"'), true);
  assert.equal(dashboardSource.includes('label="Total Actual"'), true);
  assert.equal(dashboardSource.includes('label="Remaining Budget"'), true);
  assert.equal(dashboardSource.includes('label="Needs Action"'), true);
  assert.equal(dashboardSource.includes("Forecast less actual"), true);
  assert.equal(dashboardSource.includes("Actual / Committed"), false);
  assert.equal(dashboardSource.includes("used/committed"), false);
});

test("saved Forecast and Actual edits invalidate every Command Center financial summary", () => {
  assert.equal(fullBudgetGridSource.includes('field: "forecastCents" | "actualCents"'), true);
  assert.equal(fullBudgetGridSource.includes('new CustomEvent("budget-financials:changed", { detail: { eventId } })'), true);
  assert.equal(dashboardSource.includes('window.addEventListener("budget-financials:changed", handleFinancialsChanged)'), true);
  assert.equal(budgetBlocksSource.includes('window.addEventListener("budget-financials:changed", handleGroupsChanged)'), true);
  assert.equal(dashboardSource.includes('{ cache: "no-store" }'), true);
  assert.equal(budgetBlocksSource.includes('{ cache: "no-store" }'), true);
});

test("budget dashboard category and action links preserve grid filter metadata", () => {
  assert.equal(budgetBlocksSource.includes("gridHref(eventId, { category: block.categoryKey })"), true);
  assert.equal(dashboardSource.includes("safeDashboardHref(eventId, item.link)"), true);
});

test("full budget grid safely consumes supported URL filter params", () => {
  assert.equal(fullBudgetGridSource.includes("useSearchParams()"), true);
  assert.equal(fullBudgetGridSource.includes('params.get("category")'), true);
  assert.equal(fullBudgetGridSource.includes('params.get("status")'), true);
  assert.equal(fullBudgetGridSource.includes('params.get("search")'), true);
  assert.equal(fullBudgetGridSource.includes("normalizeOptionalLineItemStatusFilter"), true);
});

test("budget dashboard removes the legacy category panel and budget intelligence surface", () => {
  assert.equal(dashboardSource.includes("const CATEGORY_PANEL_LIMIT = 4;"), false);
  assert.equal(dashboardSource.includes("const visibleCategories = categories.slice(0, CATEGORY_PANEL_LIMIT);"), false);
  assert.equal(dashboardSource.includes("<BudgetBlocksSection eventId={eventId} />"), true);
  assert.equal(dashboardSource.includes("Budget Intelligence"), false);
  assert.equal(dashboardSource.includes("intelligenceSignals"), false);
  assert.equal(dashboardSource.includes("View all signals"), false);
});

test("budget category blocks render only Forecast, Actual, Remaining, and Utilization financials", () => {
  assert.equal(budgetBlocksSource.includes("{block.categoryLabel}"), true);
  assert.equal(budgetBlocksSource.includes("{block.rowCount} {block.rowCount === 1 ? \"row\" : \"rows\"}"), true);
  assert.equal(budgetBlocksSource.includes("Forecast {formatMoney(block.forecastCents)}"), true);
  assert.equal(budgetBlocksSource.includes("{formatMoney(block.actualCents)}"), true);
  assert.equal(budgetBlocksSource.includes("Over budget"), true);
  assert.equal(budgetBlocksSource.includes("Near target"), true);
  assert.equal(budgetBlocksSource.includes("Remaining"), true);
  assert.equal(budgetBlocksSource.includes("Utilization"), true);
  assert.equal(budgetBlocksSource.includes("Exposure"), false);
  assert.equal(budgetBlocksSource.includes("formatSignedMoney(block.varianceCents)"), false);
});

test("budget work queue and recent activity panels cap visible rows", () => {
  assert.equal(dashboardSource.includes("const WORK_QUEUE_PANEL_LIMIT = 2;"), true);
  assert.equal(dashboardSource.includes("const ACTIVITY_PANEL_LIMIT = 3;"), true);
  assert.equal(dashboardSource.includes("const visibleWorkQueue = workQueue.slice(0, WORK_QUEUE_PANEL_LIMIT);"), true);
  assert.equal(dashboardSource.includes("const visibleActivity = recentActivity.slice(0, ACTIVITY_PANEL_LIMIT);"), true);
  assert.equal(dashboardSource.includes("View all budget actions"), true);
  assert.equal(dashboardSource.includes("View full history"), true);
});

test("dashboard rows use stretch grids and full-height cards without clipping", () => {
  assert.equal(dashboardSource.includes("grid items-stretch gap-3 xl:grid-cols-2"), true);
  assert.equal(dashboardSource.includes("flex h-full min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm"), true);
  assert.equal(dashboardSource.includes("mt-2.5 flex-1 divide-y divide-slate-100"), true);
  assert.equal(dashboardSource.includes("2xl:grid-cols-[minmax(0,1fr)_150px]"), false);
  assert.equal(dashboardSource.includes("signalActionLabel(signal.type)"), false);
  assert.equal(dashboardSource.includes("lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]"), false);
  assert.equal(dashboardSource.includes("overflow-hidden"), false);
  assert.equal(dashboardSource.includes("overflow-y"), false);
  assert.equal(dashboardSource.includes("max-h-"), false);
  assert.equal(dashboardSource.includes("lg:h-["), false);
  assert.equal(dashboardSource.includes("h-fit self-start"), false);
  assert.equal(dashboardSource.includes("line-clamp"), false);
  assert.equal(dashboardSource.includes("truncate"), false);
  assert.equal(dashboardSource.includes("min-h-"), false);
});

test("budget dashboard avoids write-only action labels for read-only users", () => {
  assert.equal(dashboardSource.includes("permissions?: {"), true);
  assert.equal(dashboardSource.includes("canWriteBudget ? item.actionLabel : \"Open in grid\""), true);
});

test("budget dashboard renders safe loading, error, and empty states", () => {
  assert.equal(dashboardSource.includes("Loading budget dashboard..."), true);
  assert.equal(dashboardSource.includes("Unable to load Budget Command Center"), true);
  assert.equal(dashboardSource.includes("BudgetDashboardEmptyState"), true);
  assert.equal(dashboardSource.includes("No budget data yet"), true);
  assert.equal(dashboardSource.includes("Import a budget spreadsheet or add your first line item"), true);
  assert.equal(dashboardSource.includes("Import budget"), true);
  assert.equal(dashboardSource.includes("Add line item"), true);
  assert.equal(budgetBlocksSource.includes("No budget categories yet. Add line items in the budget grid."), true);
  assert.equal(dashboardSource.includes("No budget risks detected."), false);
  assert.equal(dashboardSource.includes("No budget actions pending."), true);
  assert.equal(dashboardSource.includes("No recent budget activity."), true);
});

test("global budgets page behavior remains the full budget grid", () => {
  assert.equal(globalBudgetPageSource.includes("export default function BudgetsPage()"), true);
  assert.equal(globalBudgetPageSource.includes("return <FullBudgetGrid />;"), true);
  assert.equal(globalBudgetPageSource.includes("FullBudgetGridProps"), false);
  assert.equal(globalBudgetPageSource.includes("BudgetDashboard"), false);
});

// --- Issue 1: import modal closes and refreshes after a successful import ---

test("successful budget import reloads the grid, then closes the modal and resets state", () => {
  // Reload happens so imported rows + totals are visible after closing.
  assert.equal(
    fullBudgetGridSource.includes("await loadBudget(selectedEventId, { keepEditMode: false });"),
    true,
  );
  // Close/refresh decision is driven by the pure helper.
  assert.equal(
    budgetImportActionSource.includes("buildBudgetImportSuccessOutcome({ importedCount, skippedCount, hasOtherSheets })"),
    true,
  );
  assert.equal(budgetImportActionSource.includes("if (outcome.closeModal) {"), true);
  assert.equal(budgetImportActionSource.includes("setIsImportModalOpen(false);"), true);
  assert.equal(budgetImportActionSource.includes("resetImportState();"), true);
  // Success toast carries the imported/skipped detail from the helper.
  assert.equal(fullBudgetGridSource.includes("detail: outcome.noticeDetail,"), true);
});

test("import success no longer traps the user in a reset multi-sheet picker", () => {
  // The old keep-modal-open-on-multi-sheet branch must be gone.
  assert.equal(fullBudgetGridSource.includes("Select another sheet to import, or close."), false);
});

// --- Issue 2: improved empty-recipient copy; recipients still render ---

test("submit-for-approval shows actionable empty-reviewer copy", () => {
  assert.equal(
    fullBudgetGridSource.includes(
      "No reviewers are available for this event. Add event members or eligible reviewers before",
    ),
    true,
  );
  // The old vague copy is replaced.
  assert.equal(fullBudgetGridSource.includes("No recipients available for this event."), false);
});

test("eligible recipients still render as selectable checkboxes when present", () => {
  assert.equal(fullBudgetGridSource.includes("submissionRecipients.map((recipient) =>"), true);
  assert.equal(fullBudgetGridSource.includes("toggleRecipient(recipient.id)"), true);
});

// --- Issue 3: budget grid layout is readable after import ---

test("budget grid uses an explicit colgroup so columns cannot collapse/overlap", () => {
  // Fixed table layout + pinned columns + dynamic ordered columns gives each
  // visible column a real width even after user reordering.
  assert.equal(fullBudgetGridSource.includes("table-fixed"), true);
  assert.equal(fullBudgetGridSource.includes("<colgroup>"), true);
  assert.equal(fullBudgetGridSource.includes("<col style={{ width: 88 }} />"), true);
  assert.equal(fullBudgetGridSource.includes("<col style={{ width: 210 }} />"), true);
  assert.equal(fullBudgetGridSource.includes("BUDGET_COLUMN_WIDTHS[column.id]"), true);
  assert.equal(fullBudgetGridSource.includes("orderedColumns.map((column) => ("), true);
  assert.equal(fullBudgetGridSource.includes(">Line Item</th>"), false);
  assert.equal(fullBudgetGridSource.includes(">Actions</th>"), false);
});

test("select header and category header are separate columns", () => {
  // Select is its own header cell (checkbox + label) distinct from Category.
  assert.equal(fullBudgetGridSource.includes("<span>Select</span>"), true);
  // Category is now a sortable header (Prompt 8), still its own column cell.
  assert.equal(fullBudgetGridSource.includes('renderSortableHeader("Category", "category", "category")'), true);
  // The collapsing percentage-width header that caused "SELECTCATEGORY" is gone.
  assert.equal(fullBudgetGridSource.includes('w-[5%] min-w-[4.5rem]'), false);
});

test("forecast/actual columns are wide enough and no longer clip currency", () => {
  // 132px columns comfortably fit values like $225,000.00.
  assert.equal(fullBudgetGridSource.includes("forecast: 132"), true);
  assert.equal(fullBudgetGridSource.includes("actual: 132"), true);
  // The narrow caps that clipped currency/category inputs are removed.
  assert.equal(fullBudgetGridSource.includes("max-w-[6.5rem]"), false);
  assert.equal(fullBudgetGridSource.includes("max-w-[7.5rem]"), false);
});

test("imported currency values render via formatMoney without clipping wrappers", () => {
  assert.equal(fullBudgetGridSource.includes("formatMoney(optimisticItem.forecastCents)"), true);
  assert.equal(fullBudgetGridSource.includes("formatMoney(optimisticItem.actualCents)"), true);
});

test("horizontal scrolling is preserved for the wide grid", () => {
  assert.equal(fullBudgetGridSource.includes("overflow-x-auto"), true);
  // Still wide enough for spreadsheet editing after removing Line Item + Actions.
  assert.equal(fullBudgetGridSource.includes("min-w-[1508px]"), true);
});

// --- Issue 4: new categories/subcategories are added as line-item text ---

test("import explains that new categories/subcategories are added to imported rows", () => {
  assert.equal(
    budgetImportActionSource.includes(
      "New categories and subcategories from your file will be added to the imported budget rows.",
    ),
    true,
  );
});

// --- Issue 5: only the selected sheet is imported (UX copy + payload) ---

test("import UX states that only the selected sheet is imported", () => {
  assert.equal(
    budgetImportActionSource.includes(
      "Only the selected sheet will be imported. To import another sheet, run a separate import.",
    ),
    true,
  );
});

test("import payload sends only the single selected sheet's mapped rows", () => {
  // Draft rows are derived from one sheet at a time...
  assert.equal(
    budgetImportActionSource.includes("const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);"),
    true,
  );
  // ...and the POST body sends exactly that single-sheet state.
  assert.equal(
    budgetImportActionSource.includes("body: JSON.stringify({ rows: importDraftRows, rowNumbers: importRowNumbers }),"),
    true,
  );
});
