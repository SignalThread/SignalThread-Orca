import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sharedSource = readFileSync("lib/bulk-edit-ui.ts", "utf8");
const runOfShowSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const budgetSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const timelineListSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const timelinePageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("bulk edit modules share the Run of Show toolbar and toast sizing contract", () => {
  for (const exportName of [
    "BULK_ACTION_BAR_CLASS",
    "BULK_SELECTED_COUNT_CLASS",
    "BULK_CONTROL_CLASS",
    "BULK_CLEAR_BUTTON_CLASS",
    "BULK_DELETE_BUTTON_CLASS",
    "BULK_SELECTED_ROW_CLASS",
    "BULK_SUCCESS_TOAST_CLASS",
  ]) {
    assert.match(sharedSource, new RegExp(`export const ${exportName}`));
    assert.match(runOfShowSource, new RegExp(exportName));
  }

  assert.match(sharedSource, /rounded-xl border border-blue-200 bg-blue-50\/80 px-3 py-3/);
  assert.match(sharedSource, /h-9 min-w-\[10rem\] rounded-lg border border-blue-200/);
  assert.match(sharedSource, /fixed right-5 bottom-5 z-50 rounded-2xl/);
  assert.match(sharedSource, /TABLE_CONTROL_ROW_CLASS/);
  assert.match(sharedSource, /TABLE_FILTER_PANEL_CLASS/);
});

test("Run of Show keeps the canonical conditional toolbar and fixed success toast", () => {
  const overviewSource = sourceBetween(runOfShowSource, "function MatrixOverviewTable", "export default function Matrix2Page");
  const flashSource = sourceBetween(runOfShowSource, "{flashMessage ? (", "{flashErrorMessage ? (");

  assert.match(overviewSource, /\{selectedCount > 0 \? \(/);
  assert.match(overviewSource, /data-testid="matrix-overview-bulk-action-bar"/);
  assert.match(overviewSource, /className=\{BULK_ACTION_BAR_CLASS\}/);
  assert.match(overviewSource, /onClick=\{onClearSelection\}/);
  assert.match(flashSource, /className=\{BULK_SUCCESS_TOAST_CLASS\}/);
});

test("Run of Show hides filters entirely in Board view and keeps board sessions on search-only data", () => {
  const topStripSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx", "utf8");
  const boardRenderSource = sourceBetween(runOfShowSource, "<Matrix2Board", "/>");

  assert.match(topStripSource, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
  assert.match(topStripSource, /const showListFilters = zoomMode === "OVERVIEW"/);
  assert.match(topStripSource, /\{showListFilters \? \(/);
  assert.match(topStripSource, /\{showListFilters && filtersOpen \? \(/);
  assert.match(topStripSource, /data-testid="matrix-filters-toggle"/);
  assert.match(topStripSource, /data-testid="matrix-filter-panel"/);
  assert.match(topStripSource, /value: "PLANNING", label: "Board"/);
  assert.match(topStripSource, /value: "OVERVIEW", label: "List"/);
  assert.match(boardRenderSource, /sessions=\{visibleSessions\}/);
  assert.doesNotMatch(boardRenderSource, /listVisibleSessions/);
});

test("Run of Show List filters are column-based and keep module chips out of the panel", () => {
  const topStripSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx", "utf8");
  const filterPanelSource = sourceBetween(topStripSource, "{showListFilters && filtersOpen ? (", "{activeFilterCount > 0 ? (");

  assert.match(topStripSource, /type MatrixListFilterState = \{/);
  assert.match(topStripSource, /type: string;/);
  assert.match(topStripSource, /roomId: string;/);
  assert.match(topStripSource, /speakers: MatrixListPresenceFilter;/);
  assert.match(topStripSource, /av: MatrixListPresenceFilter;/);
  assert.match(topStripSource, /fnb: MatrixListPresenceFilter;/);
  assert.match(topStripSource, /staffing: MatrixListPresenceFilter;/);
  assert.match(topStripSource, /aria-expanded=\{filtersOpen\}/);
  assert.match(topStripSource, /activeFilterCount > 0 \? `Filters · \$\{activeFilterCount\}` : "Filters"/);
  assert.match(topStripSource, /Object\.values\(listFilters\)\.filter\(Boolean\)\.length/);
  assert.match(topStripSource, /onClearListFilters/);

  for (const option of ["All types", "All rooms", "All speakers", "All AV", "All F&B", "All staffing"]) {
    assert.match(filterPanelSource, new RegExp(option.replace("&", "&")));
  }
  assert.match(filterPanelSource, /TABLE_FILTER_CONTROL_CLASS/);
  assert.doesNotMatch(topStripSource, /FILTER_OPTIONS/);
  assert.doesNotMatch(topStripSource, /compactLabel/);
  assert.doesNotMatch(topStripSource, /Conflicts Only/);
});

test("Run of Show List filters affect table rows and clear explicitly without changing bulk edit", () => {
  const visibleSource = sourceBetween(runOfShowSource, "const visibleSessions = useMemo", "useEffect(() => {");
  const overviewSource = sourceBetween(runOfShowSource, "const overviewSessions = useMemo", "const operationsSessionId = useMemo");
  const topStripPropsSource = sourceBetween(runOfShowSource, "<Matrix2TopStrip", "/>");
  const bulkSource = sourceBetween(runOfShowSource, "function MatrixOverviewTable", "export default function Matrix2Page");

  assert.match(visibleSource, /const listVisibleSessions = useMemo/);
  assert.match(visibleSource, /listFilters\.type && session\.sessionType !== listFilters\.type/);
  assert.match(visibleSource, /listFilters\.roomId === "__unassigned__"/);
  assert.match(visibleSource, /matchesMatrixListPresenceFilter\(listFilters\.speakers, session\.speakers\.length\)/);
  assert.match(visibleSource, /matchesMatrixListPresenceFilter\(listFilters\.av, session\.avRequirements\.length\)/);
  assert.match(visibleSource, /matchesMatrixListPresenceFilter\(listFilters\.fnb, session\.foodAndBeverage\.length\)/);
  assert.match(visibleSource, /matchesMatrixListPresenceFilter\(listFilters\.staffing, session\.staffAssigned\.length\)/);
  assert.match(overviewSource, /const sorted = \[\.\.\.listVisibleSessions\]/);
  assert.match(topStripPropsSource, /listFilters=\{listFilters\}/);
  assert.match(topStripPropsSource, /onListFiltersChange=\{handleListFiltersChange\}/);
  assert.match(topStripPropsSource, /onClearListFilters=\{handleClearListFilters\}/);
  assert.match(runOfShowSource, /setListFilters\(EMPTY_MATRIX_LIST_FILTERS\)/);
  assert.match(bulkSource, /data-testid="matrix-overview-bulk-action-bar"/);
  assert.match(bulkSource, /onBulkUpdateSessions/);
  assert.match(bulkSource, /onBulkDeleteSessions/);
});

test("Budget bulk editing uses the shared selected toolbar without reserving empty space", () => {
  const bulkSource = sourceBetween(budgetSource, "{hasSomeSelected ? (", "<div className=\"overflow-x-auto\">");

  assert.match(bulkSource, /data-testid="budget-line-item-bulk-action-bar"/);
  assert.match(bulkSource, /className=\{BULK_ACTION_BAR_CLASS\}/);
  assert.match(bulkSource, /className=\{BULK_CONTROL_CLASS\}/);
  assert.match(bulkSource, /Clear selection/);
  assert.match(bulkSource, /Delete selected/);
  assert.doesNotMatch(bulkSource, /border-b border-slate-200 bg-slate-50\/80 px-4 py-2/);
});

test("Budget filters live in a collapsed panel and primary row keeps search/actions visible", () => {
  const headerSource = sourceBetween(budgetSource, "<div className=\"mt-3 flex min-w-0 flex-wrap items-center gap-2\">", "{hasSomeSelected ? (");

  assert.match(budgetSource, /const \[lineItemsFiltersOpen, setLineItemsFiltersOpen\] = useState\(false\)/);
  assert.match(headerSource, /data-testid="budget-filters-toggle"/);
  assert.match(headerSource, /aria-expanded=\{shouldShowLineItemFilters\}/);
  assert.match(headerSource, /activeLineItemFilterCount > 0 \? `Filters · \$\{activeLineItemFilterCount\}` : "Filters"/);
  assert.match(headerSource, /Search line item, vendor, category, group, or session/);
  assert.doesNotMatch(headerSource, /<ColumnOrderControl/);
  assert.match(budgetSource, /useColumnHeaderReorder/);
  assert.match(budgetSource, /getHeaderReorderProps\(column\)/);
  assert.match(budgetSource, /shouldShowLineItemFilters \? \(/);
  assert.match(budgetSource, /data-testid="budget-filter-panel"/);
  assert.match(budgetSource, /All categories/);
  assert.match(budgetSource, /All sessions/);
  assert.match(budgetSource, /All statuses/);
  assert.match(budgetSource, /All approvals/);
});

test("Budget selected rows and success feedback match the shared pattern", () => {
  const noticeSource = sourceBetween(budgetSource, "{budgetNotice && (", "<div className=\"grid gap-3");

  assert.match(budgetSource, /selected[\s\S]*BULK_SELECTED_ROW_CLASS/);
  assert.match(budgetSource, /title: `Updated \$\{dirtyIds\.length\} line item/);
  assert.match(noticeSource, /BULK_SUCCESS_TOAST_CLASS/);
  assert.doesNotMatch(noticeSource, /rounded-lg border px-3 py-2\.5/);
  assert.doesNotMatch(noticeSource, /border-emerald-200 bg-emerald-50/);
  assert.doesNotMatch(budgetSource, /New row — save changes to create it/);
});

test("Timeline bulk editing uses the shared toolbar and selected-row treatment", () => {
  const bulkSource = sourceBetween(timelineListSource, "{canEdit && selectedCount > 0 ? (", "<div className=\"overflow-x-auto");

  assert.match(bulkSource, /data-testid="timeline-bulk-action-bar"/);
  assert.match(bulkSource, /className=\{BULK_ACTION_BAR_CLASS\}/);
  assert.match(bulkSource, /className=\{BULK_CONTROL_CLASS\}/);
  assert.match(bulkSource, /Clear selection/);
  assert.match(bulkSource, /Delete selected/);
  assert.match(timelineListSource, /isSelected \? BULK_SELECTED_TABLE_ROW_CLASS : ""/);
  assert.doesNotMatch(bulkSource, /sticky top-2/);
  assert.doesNotMatch(bulkSource, /h-8 rounded-md border border-slate-300/);
});

test("Timeline Matrix keeps search in its content row while the shared Roadmap toolbar owns Filters", () => {
  const controlsSource = sourceBetween(timelineListSource, "<div className={TABLE_CONTROL_ROW_CLASS}", "{canEdit && selectedCount > 0 ? (");

  assert.match(timelineListSource, /filtersOpen: boolean;/);
  assert.match(controlsSource, /Search item or owner/);
  assert.doesNotMatch(controlsSource, /timeline-filters-toggle/);
  assert.doesNotMatch(controlsSource, /<Filter/);
  assert.match(timelinePageSource, /filtersOpen=\{listFiltersOpen\}/);
  assert.match(timelinePageSource, /data-testid="timeline-shell-filters-toggle"/);
  assert.match(timelinePageSource, /viewSupportsFilters = viewMode !== "DASHBOARD"/);
  assert.match(timelinePageSource, /usesTimelineShellFilters = viewMode !== "LIST"/);
  assert.match(controlsSource, /Search item or owner/);
  assert.doesNotMatch(controlsSource, /<ColumnOrderControl/);
  assert.match(timelineListSource, /useColumnHeaderReorder/);
  assert.match(timelineListSource, /getHeaderReorderProps\(column\)/);
  assert.match(timelineListSource, /filtersOpen \? \(/);
  assert.match(timelineListSource, /data-testid="timeline-filter-panel"/);
  assert.match(timelineListSource, /All statuses/);
  assert.match(timelineListSource, /All workstreams/);
  assert.match(timelineListSource, /All stages/);
  assert.match(timelineListSource, /All priorities/);
  assert.match(timelineListSource, /All owners/);
  assert.match(timelineListSource, /All critical path/);
});

test("Timeline page shell omits filter controls and filter fields on Dashboard", () => {
  assert.match(timelinePageSource, /const \[timelineFiltersOpen, setTimelineFiltersOpen\] = useState\(false\)/);
  assert.match(timelinePageSource, /const \[listFiltersOpen, setListFiltersOpen\] = useState\(false\)/);
  assert.match(timelinePageSource, /data-testid="timeline-shell-filters-toggle"/);
  assert.match(timelinePageSource, /viewSupportsFilters \? \(/);
  assert.match(timelinePageSource, /usesTimelineShellFilters && viewSupportsFilters && timelineFiltersOpen \? \(/);
  assert.match(timelinePageSource, /data-testid="timeline-shell-filter-panel"/);
  assert.match(timelinePageSource, /setFilterWorkstream\("ALL"\)/);
  assert.match(timelinePageSource, /setFilterStage\("ALL"\)/);
});

test("Timeline bulk update success is a bottom-right toast, not an in-flow banner", () => {
  const bulkUpdateSource = sourceBetween(timelinePageSource, "const handleBulkUpdateItems = useCallback", "const handleBulkDeleteItems = useCallback");
  const successRenderSource = sourceBetween(timelinePageSource, "{successMessage ? (", "{isCreateOpen ? (");

  assert.match(bulkUpdateSource, /`Updated \$\{payload\.updatedCount \?\? 0\} timeline item/);
  assert.match(successRenderSource, /className=\{BULK_SUCCESS_TOAST_CLASS\}/);
  assert.doesNotMatch(successRenderSource, /rounded-lg border border-emerald-200 bg-emerald-50/);
  assert.match(timelinePageSource, /window\.setTimeout\(\(\) => setSuccessMessage\(null\), 2400\)/);
});
