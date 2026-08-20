import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateTimelineCompletion } from "@/lib/timeline/completion";

const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const boardSource = readFileSync("app/(shell)/timeline/_components/TimelineBoardView.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const eventPageSource = readFileSync("app/(shell)/events/[eventId]/timeline/page.tsx", "utf8");
const dateFieldSource = readFileSync("components/date-field.tsx", "utf8");

// ── List filters / bulk selection ────────────────────────────────────────────

test("Timeline filters render in list view", () => {
  assert.ok(listSource.includes('aria-label="Search timeline items"'), "search filter");
  assert.ok(listSource.includes('aria-label="Filter by status"'), "status filter");
  assert.ok(listSource.includes('aria-label="Filter by workstream"'), "workstream filter");
  assert.ok(listSource.includes('aria-label="Filter by stage"'), "stage filter");
  assert.ok(listSource.includes('aria-label="Filter by priority"'), "priority filter");
  assert.ok(listSource.includes('aria-label="Filter by owner"'), "owner filter");
  assert.ok(listSource.includes('aria-label="Filter by critical path"'), "critical path filter");
  assert.equal(listSource.includes('aria-label="Filter by department"'), false, "Department filter should not render");
  assert.equal(listSource.includes("All departments"), false, "Department dropdown should not render");
  assert.equal(listSource.includes("All Teams"), false, "legacy team option should not render");
  assert.equal(listSource.includes('ariaLabel="Filter timeline from date"'), false, "date filters are not in the compact row");
  assert.equal(listSource.includes('ariaLabel="Filter timeline to date"'), false, "date filters are not in the compact row");
});

test("Timeline filters use the shared collapsed table-control layout", () => {
  assert.ok(listSource.includes("TABLE_CONTROL_ROW_CLASS"), "primary row uses shared table control shell");
  assert.ok(listSource.includes("TABLE_SEARCH_FIELD_CLASS"), "search uses shared table search sizing");
  assert.ok(pageSource.includes('data-testid="timeline-shell-filters-toggle"'), "shell owns the filters toggle");
  assert.ok(pageSource.includes("setListFiltersOpen((current) => !current)"), "List view toggles its panel through the shell");
  assert.ok(listSource.includes('data-testid="timeline-filter-panel"'), "filter controls live in a collapsible panel");
  assert.ok(listSource.includes("TABLE_FILTER_CONTROL_CLASS"), "filter dropdowns use shared panel control sizing");
  assert.equal(listSource.includes("<ColumnOrderControl"), false, "columns popover is not the primary reorder UI");
  assert.ok(listSource.includes("useColumnHeaderReorder"), "column order is handled by draggable headers");
});

test("Timeline filters affect visible list rows", () => {
  assert.ok(listSource.includes("function itemMatchesFilters"), "filter matcher exists");
  assert.ok(listSource.includes("taskItems.filter((item) => itemMatchesFilters(item, filters))"), "filtered rows derive from matcher");
  // Rows render from the windowed slice of the filtered items (virtualization).
  assert.ok(listSource.includes("visibleTaskItems.map((item) =>"), "table renders windowed filtered rows");
  assert.ok(listSource.includes("filteredTaskItems.slice(virtual.startIndex, virtual.endIndex)"), "windowed slice comes from filtered items");
  assert.ok(listSource.includes("No timeline items match the current filters."), "filtered empty state");
});

test("Timeline selection works with filtered visible rows", () => {
  assert.ok(listSource.includes("visibleFilteredIds"), "visible filtered ids are tracked");
  assert.ok(listSource.includes("toggleSelectAllVisible"), "header checkbox toggles visible rows");
  assert.ok(listSource.includes("toggleRowSelection"), "row checkbox toggles one row");
  assert.ok(listSource.includes("Select visible timeline rows"), "select-all control is accessible");
});

test("Bulk action bar appears only when editable rows are selected", () => {
  assert.ok(listSource.includes("canEdit && selectedCount > 0"), "bulk bar requires edit access and selection");
  assert.ok(listSource.includes("Set status..."), "bulk status dropdown");
  assert.ok(listSource.includes("Set priority..."), "bulk priority dropdown");
  assert.ok(listSource.includes("Set stage..."), "bulk stage dropdown");
  assert.ok(listSource.includes("Set workstream..."), "bulk workstream dropdown");
  assert.ok(listSource.includes("Set owner..."), "bulk owner dropdown");
  assert.ok(listSource.includes("Set critical path..."), "bulk critical path dropdown");
  assert.equal(listSource.includes("Edit selected"), false, "bulk drawer trigger is no longer primary UX");
  assert.ok(listSource.includes("Delete selected"), "bulk delete action");
});

test("Bulk edit does not expose Department", () => {
  assert.equal(listSource.includes("Update Department"), false);
  assert.equal(listSource.includes("bulkEnabled.department"), false);
  assert.equal(listSource.includes("patch.department"), false);
});

test("List filter, row edit, and bulk workstream dropdowns include custom workstream options", () => {
  assert.ok(listSource.includes("buildTimelineWorkstreamOptions(taskItems)"));
  assert.ok(listSource.includes("workstreamOptions.map((option) => ("));
  assert.ok(listSource.includes("getWorkstreamDisplayKey(item.workstream ?? item.department)"));
  assert.ok(listSource.includes("department: option.department"));
});

test("Read-only users do not see bulk edit actions", () => {
  assert.ok(listSource.includes("canEdit && selectedCount > 0"), "bulk action bar is gated by canEdit");
  assert.ok(listSource.includes("disabled={!canEdit || visibleFilteredIds.length === 0}"), "select all disabled read-only");
  assert.ok(listSource.includes("disabled={!canEdit}"), "row selection disabled read-only");
});

// ── Inline editing structure ─────────────────────────────────────────────────

test("list view accepts canEdit prop and gates editing behind it", () => {
  assert.ok(listSource.includes("canEdit: boolean"), "TimelineListViewProps must include canEdit: boolean");
  assert.ok(listSource.includes("if (!canEdit) return"), "beginCellEdit must return early when !canEdit");
  assert.ok(listSource.includes("disabled={!canEdit}"), "cell buttons must be disabled when !canEdit");
});

test("list view uses cell-level editing state, not row-level draft", () => {
  assert.ok(listSource.includes("editingCell"), "must have editingCell state");
  assert.ok(listSource.includes("cellDraftValue"), "must have cellDraftValue state");
  assert.ok(listSource.includes("savingCells"), "must have savingCells Set for per-cell saving state");
  assert.ok(listSource.includes("cellErrors"), "must have cellErrors Map for per-cell error state");
  // old row-level draft removed
  assert.equal(listSource.includes("editingItemId"), false, "row-level editingItemId must be removed");
  assert.equal(listSource.includes("type RowDraft"), false, "RowDraft type must be removed");
});

test("list view exposes workstream and stage columns (regression)", () => {
  assert.ok(listSource.includes('{ id: "workstream", label: "Workstream" }'), "Workstream column metadata");
  assert.ok(listSource.includes('{ id: "planningStage", label: "Stage" }'), "Stage column metadata");
  assert.ok(listSource.includes("orderedColumns.map((column) => ("), "dynamic column headers");
  assert.ok(listSource.includes("getWorkstreamLabel(item.workstream ?? item.department)"), "workstream label display");
  assert.ok(listSource.includes("getPlanningStageLabel(item.planningStage)"), "planning stage label display");
});

test("list view has a dedicated Critical Path column", () => {
  assert.ok(listSource.includes('{ id: "isCriticalPath", label: "CP" }'), "CP column metadata must exist");
  assert.ok(listSource.includes("commitCriticalPath"), "commitCriticalPath function must exist");
  assert.ok(listSource.includes('type="checkbox"'), "Critical Path uses a checkbox input");
  assert.ok(listSource.includes("isCriticalPath"), "isCriticalPath is referenced in the list view");
  // Critical Path is no longer bundled inside the planningStage cell as a checkbox label
  assert.equal(
    listSource.includes(">Critical path</label>"),
    false,
    "inline Critical path checkbox label inside Stage cell must be removed",
  );
});

test("list view selects commit immediately on change (no explicit save button)", () => {
  assert.ok(
    listSource.includes('onChange={(e) => void onCommitCell(item.id, "workstream"'),
    "workstream select onChange triggers commitCell",
  );
  assert.ok(
    listSource.includes('onChange={(e) => void onCommitCell(item.id, "planningStage"'),
    "planningStage select onChange triggers commitCell",
  );
  assert.ok(
    listSource.includes('onChange={(e) => void onCommitCell(item.id, "status"'),
    "status select onChange triggers commitCell",
  );
  assert.ok(
    listSource.includes('onChange={(e) => void onCommitCell(item.id, "priority"'),
    "priority select onChange triggers commitCell",
  );
  assert.ok(
    listSource.includes('onChange={(e) => void onCommitCell(item.id, "ownerUserId"'),
    "owner select onChange triggers commitCell",
  );
});

test("list view title input saves on Enter, cancels on Esc", () => {
  assert.equal(listSource.includes("onBlur={() => void onCommitCell(item.id, \"title\", draftValue, item)"), false);
  assert.ok(listSource.includes("handleTextKeyDown"), "title input has handleTextKeyDown handler");
  assert.ok(listSource.includes('"Enter"'), "handleTextKeyDown handles Enter key");
  assert.ok(listSource.includes('"Escape"'), "handleTextKeyDown handles Escape key");
  assert.ok(listSource.includes("cancelCellEdit"), "cancelCellEdit is defined");
});

test("Matrix inline editors share a save, dismiss, and focus lifecycle", () => {
  assert.ok(listSource.includes("const closeCellEditor = useCallback"), "editors use one close helper");
  assert.ok(listSource.includes("closeCellEditor({ itemId, field }, focusTarget)"), "saving closes the active editor");
  assert.ok(listSource.includes('document.addEventListener("pointerdown", handlePointerDown)'), "outside clicks are scoped while editing");
  assert.ok(listSource.includes('document.removeEventListener("pointerdown", handlePointerDown)'), "outside-click listener is cleaned up");
  assert.ok(listSource.includes('target.closest("[data-timeline-inline-editor]")'), "editor interactions remain open");
  assert.ok(dateFieldSource.includes('data-date-field-popover="true"'), "portaled date controls are identifiable");
  assert.ok(listSource.includes('target.closest("[data-date-field-popover]")'), "portaled date controls remain open");
  assert.ok(listSource.includes("nextEditorTrigger || otherInteractiveControl ? \"none\" : \"current\""), "opening another cell dismisses the prior editor");
  assert.ok(listSource.includes("const handleEditorKeyDown = useCallback"), "non-text editors share keyboard handling");
  assert.ok(listSource.includes('event.key === "Escape"'), "Escape cancels editing");
  assert.ok(listSource.includes('event.key === "Enter" || event.key === "Tab"'), "Enter and Tab confirm editing");
  assert.ok(listSource.includes('event.key === "Tab" ? "next" : "current"'), "Tab advances to the next editable cell");
  assert.ok(listSource.includes('data-timeline-edit-cell={cellKey(item.id, "planningStage")}'), "stage has a focus return target");
});

test("list view DateField cells commit on onChange", () => {
  assert.ok(
    listSource.includes('onChange={(value) => void onCommitCell(item.id, "startDate"'),
    "startDate DateField onChange triggers commitCell",
  );
  assert.ok(
    listSource.includes('onChange={(value) => void onCommitCell(item.id, "endDate"'),
    "endDate DateField onChange triggers commitCell",
  );
});

test("DateField calendar renders through a fixed portal layer above table scroll containers", () => {
  assert.ok(dateFieldSource.includes('import { createPortal } from "react-dom"'), "DateField imports createPortal");
  assert.ok(dateFieldSource.includes("createPortal("), "calendar popover is portaled");
  assert.ok(dateFieldSource.includes("document.body"), "calendar portal targets document.body");
  assert.ok(dateFieldSource.includes('position: "fixed"'), "calendar popover uses fixed viewport positioning");
  assert.ok(dateFieldSource.includes("zIndex: 90"), "calendar layer sits above table chrome and menus");
  assert.ok(dateFieldSource.includes("popoverRef.current?.contains(target)"), "click-outside keeps calendar interaction inside");
});

test("list view per-cell saving indicator uses Loader2", () => {
  assert.ok(listSource.includes("Loader2"), "Loader2 spinner imported for per-cell saving state");
  assert.ok(listSource.includes("animate-spin"), "saving indicator uses animate-spin");
  // Per-cell saving state is now scoped to the memoized row's field-only helper.
  assert.ok(listSource.includes('isSaving("title")'), "isSaving helper called per cell");
});

test("list view per-cell error renders inline below the cell control", () => {
  // Per-cell error state is now scoped to the memoized row's field-only helper.
  assert.ok(listSource.includes('getCellError("title")'), "getCellError helper used per cell");
  assert.ok(listSource.includes("text-rose-600"), "cell errors rendered in rose/red");
});

test("list view does not include a row-level save/cancel button pair", () => {
  // Old row-level save used aria-label="Save" or title="Save" on a button
  assert.equal(listSource.includes('aria-label="Save"'), false, 'no row-level aria-label="Save" button');
  assert.equal(listSource.includes('title="Save"'), false, 'no row-level title="Save" button');
  assert.equal(listSource.includes('"Cancel"'), false, "no row-level Cancel button label");
  // Pencil icon (row edit trigger) is also gone — editing starts by clicking the cell
  assert.equal(listSource.includes("Pencil"), false, "Pencil row-edit icon removed");
});

// ── Status-based completion ──────────────────────────────────────────────────

test("Roadmap completion rollups use Complete status only", () => {
  assert.equal(calculateTimelineCompletion([
    { status: "COMPLETE" },
    { status: "IN_PROGRESS" },
    { status: "NOT_STARTED" },
  ]).percentComplete, 33, "1 of 3 complete");
  assert.equal(calculateTimelineCompletion([
    { status: "COMPLETE" }, { status: "COMPLETE" }, { status: "IN_PROGRESS" }, { status: "AT_RISK" }, { status: "NOT_STARTED" },
  ]).percentComplete, 40, "2 of 5 complete");
  assert.equal(calculateTimelineCompletion([
    ...Array.from({ length: 5 }, () => ({ status: "COMPLETE" })),
    ...Array.from({ length: 8 }, () => ({ status: "IN_PROGRESS" })),
  ]).percentComplete, 38, "5 of 13 complete");
  assert.deepEqual(calculateTimelineCompletion([]), { totalItems: 0, completeItems: 0, percentComplete: 0 });
  assert.equal(
    calculateTimelineCompletion([{ status: "COMPLETE", progress: 0 }, { status: "IN_PROGRESS", progress: 100 }]).percentComplete,
    50,
    "stored item-level progress is non-authoritative",
  );
  const statusChangeItems = [{ status: "IN_PROGRESS" }, { status: "NOT_STARTED" }];
  assert.equal(calculateTimelineCompletion(statusChangeItems).percentComplete, 0);
  statusChangeItems[0].status = "COMPLETE";
  assert.equal(calculateTimelineCompletion(statusChangeItems).percentComplete, 50, "completing an item updates the rollup");
  statusChangeItems[0].status = "IN_PROGRESS";
  assert.equal(calculateTimelineCompletion(statusChangeItems).percentComplete, 0, "reopening an item reduces the rollup");
});

test("Matrix renders explicit item progress without inferred fallback", () => {
  assert.equal(listSource.includes('{ id: "progress", label: "Progress" }'), true, "Matrix has a Progress column");
  assert.ok(listSource.includes('type="number"'));
  assert.ok(listSource.includes("min={0}"));
  assert.ok(listSource.includes("max={100}"));
  assert.equal(listSource.includes("derivedProgress"), false, "Matrix has no inferred progress fallback");
  assert.equal(boardSource.includes("item.progress"), false, "Board does not use item progress");
});

// ── canEdit propagation ───────────────────────────────────────────────────────

test("TimelinePage accepts and forwards canEdit prop", () => {
  assert.ok(pageSource.includes("canEdit?: boolean"), "TimelinePageProps has optional canEdit");
  assert.ok(pageSource.includes("canEdit = true"), "canEdit defaults to true in TimelinePage");
  assert.ok(pageSource.includes("canEdit={canEdit}"), "canEdit forwarded to TimelineListView");
});

test("event-scoped timeline page resolves canEdit from event access", () => {
  assert.ok(
    eventPageSource.includes("ensureProvisionedUserAndContext"),
    "event page calls ensureProvisionedUserAndContext",
  );
  assert.ok(
    eventPageSource.includes("resolveEventAccessForUser"),
    "event page calls resolveEventAccessForUser",
  );
  assert.ok(eventPageSource.includes("decision.canEdit"), "event page reads canEdit from decision");
  assert.ok(eventPageSource.includes("canEdit={canEdit}"), "event page passes canEdit to TimelinePage");
  // defaults to false — safe default; server enforces anyway
  assert.ok(eventPageSource.includes("let canEdit = false"), "canEdit defaults to false before access check");
});

// ── Route isolation ───────────────────────────────────────────────────────────

test("list view only calls onSaveRow with TimelineItemPatch — never touches task or marketing routes", () => {
  assert.equal(listSource.includes("/tasks"), false, "list view must not reference task routes");
  assert.equal(listSource.includes("/marketing"), false, "list view must not reference marketing routes");
  assert.equal(listSource.includes("timeline-items"), false, "list view must not call the API directly (parent owns fetch)");
  assert.ok(listSource.includes("onSaveRow(itemId"), "list view calls onSaveRow from props");
  assert.ok(listSource.includes("onDeleteTask(item.id)"), "list view calls onDeleteTask from props");
});
