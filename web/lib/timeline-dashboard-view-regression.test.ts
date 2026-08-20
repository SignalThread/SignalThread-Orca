import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const shellSource = readFileSync("app/(shell)/timeline/_components/TimelineDashboardView.tsx", "utf8");
const ganttSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");
const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");

test("timeline module exposes Dashboard, Matrix, Workstream, and Board labels in product order", () => {
  const order = ["DASHBOARD", "LIST", "TIMELINE", "BOARD"];
  let cursor = -1;
  for (const value of order) {
    const idx = pageSource.indexOf(`value: "${value}"`);
    assert.ok(idx > -1, `view ${value} missing from VIEW_MODES`);
    assert.ok(idx > cursor, `view ${value} out of order`);
    cursor = idx;
  }
  assert.ok(pageSource.includes('{ value: "DASHBOARD", label: "Dashboard" }'));
  assert.ok(pageSource.includes('{ value: "LIST", label: "Matrix" }'));
  assert.ok(pageSource.includes('{ value: "TIMELINE", label: "Workstream" }'));
  assert.ok(pageSource.includes('{ value: "BOARD", label: "Board" }'));
  assert.equal(pageSource.includes('{ value: "LIST", label: "List" }'), false);
  assert.equal(pageSource.includes('{ value: "TIMELINE", label: "Roadmap" }'), false);
});

test("Dashboard is the default landing view", () => {
  assert.ok(pageSource.includes('useState<TimelineViewMode>("DASHBOARD")'));
});

test("DASHBOARD is a valid persisted view mode", () => {
  assert.ok(pageSource.includes('value === "DASHBOARD"'));
});

test("Dashboard view renders the dashboard shell and preserves other views", () => {
  assert.ok(pageSource.includes('if (viewMode === "DASHBOARD")'));
  assert.match(pageSource, /<TimelineDashboardView\s+eventId=\{selectedEventId\}/);
  assert.ok(pageSource.includes("refreshToken={dashboardRefreshToken}"));
  assert.ok(pageSource.includes("<TimelineBoardView"));
  assert.ok(pageSource.includes("<TimelineGanttView"));
  assert.ok(pageSource.includes("<TimelineListView"));
});

test("creating a roadmap item refreshes dashboard data only after server success", () => {
  assert.ok(pageSource.includes("await loadItems(createEventId);"));
  assert.ok(pageSource.includes("setDashboardRefreshToken((current) => current + 1);"));
  assert.ok(pageSource.includes("router.refresh();"));
  assert.ok(pageSource.indexOf("await loadItems(createEventId);") < pageSource.indexOf("setIsCreateOpen(false);"));
  assert.ok(shellSource.includes("refreshToken = 0"));
  assert.ok(shellSource.includes("}, [load, refreshToken]);"));
});

test("roadmap timeline supports contextual inline creation under workstream sections", () => {
  assert.ok(ganttSource.includes("Add item"));
  assert.ok(ganttSource.includes("onOpenItemCreate(row.group.key as TimelineWorkstream | \"UNASSIGNED\")"));
  assert.ok(pageSource.includes("openCreateItemModal(workstream)"));
  assert.ok(pageSource.includes("selectedItemWorkstream!.workstream"));
  assert.ok(pageSource.includes("parentId: createParentId"));
});

test("inline roadmap creation supports fast keyboard flow and server-confirmed local insert", () => {
  assert.ok(ganttSource.includes('event.key === "Enter" && !titleIsEmpty'));
  assert.ok(ganttSource.includes('event.key === "Escape"'));
  assert.ok(ganttSource.includes("disabled={titleIsEmpty || inlineDraft?.isSaving}"));
  // Inline create appends the server-returned record to local state (no full
  // reload), bumps the dashboard token, then clears the draft — in that order.
  assert.ok(pageSource.includes("const createdItem = responsePayload as TimelineItemRecord;"));
  assert.ok(pageSource.includes("setItems((current) => [...current, createdItem]);"));
  assert.ok(pageSource.includes("setDashboardRefreshToken((current) => current + 1);"));
  assert.ok(pageSource.includes("setInlineDraft(null);"));
  assert.ok(
    pageSource.indexOf("setItems((current) => [...current, createdItem]);") <
      pageSource.indexOf("setInlineDraft(null);"),
  );
});

test("global roadmap add action opens a non-layout-breaking two-action popover", () => {
  assert.ok(pageSource.includes('aria-haspopup="menu"'));
  assert.ok(pageSource.includes('aria-label="Roadmap add menu"'));
  assert.ok(pageSource.includes("addMenuRef"));
  assert.ok(pageSource.includes('document.addEventListener("pointerdown", handlePointerDown)'));
  assert.ok(pageSource.includes('event.key === "Escape"'));
  assert.ok(pageSource.includes('className="absolute right-0 top-[calc(100%+0.5rem)] z-[80]'));
  assert.match(pageSource, />\s*Add workstream\s*</);
  assert.match(pageSource, />\s*Add item\s*</);
  assert.doesNotMatch(pageSource, />\s*Add milestone\s*</);
  assert.doesNotMatch(pageSource, />\s*Advanced item\s*</);
});

test("roadmap add forms validate workstream and item creation requirements", () => {
  assert.ok(pageSource.includes('createMode === "workstream" ? "Add workstream" : createParentId ? "Add subtask" : "Add item"'));
  assert.ok(pageSource.includes("Workstream name"));
  assert.ok(pageSource.includes("Select or type workstream"));
  assert.ok(pageSource.includes("Create workstream:"));
  assert.ok(pageSource.includes("Start date is required for workstreams."));
  assert.ok(pageSource.includes("End date is required for workstreams."));
  assert.ok(pageSource.includes("Item name is required."));
  assert.ok(pageSource.includes("End date must be on or after start date."));
  assert.ok(pageSource.includes("existingWorkstreams"));
  assert.ok(pageSource.includes("timelineWorkstreamOptions"));
  assert.ok(pageSource.includes("availableWorkstreams"));
  assert.ok(pageSource.includes("All workstreams already exist"));
  assert.ok(pageSource.includes("already exists. Choose a different workstream."));
  assert.ok(pageSource.includes("resolveCreateWorkstreamChoice"));
});

test("timeline item API remains the event-scoped persistence path", () => {
  assert.ok(pageSource.includes("fetch(`/api/events/${createEventId}/timeline-items`"));
  assert.ok(pageSource.includes("await loadItems(createEventId);"));
});

test("dashboard shell fetches the canonical dashboard endpoint and handles loading/error/empty", () => {
  assert.ok(shellSource.includes("/timeline-dashboard"));
  assert.ok(shellSource.includes('phase: "loading"'));
  assert.ok(shellSource.includes('phase: "error"'));
  assert.ok(shellSource.includes("No roadmap items yet"));
  assert.ok(shellSource.includes("Add roadmap item"));
  assert.ok(shellSource.includes("Create milestone"));
  // shell must not invent client-side rollups; it consumes payload fields only
  assert.ok(shellSource.includes("data.totals.totalItems"));
  assert.ok(shellSource.includes("health={data.health}"));
});

test("dashboard renders stage cards, workstream grid, detail panel, and right rail", () => {
  for (const section of [
    "function StageCards",
    "function WorkstreamGrid",
    "function WorkstreamDetailPanel",
    "function UpcomingDatesCard",
    "function BlockersCard",
    "function HealthCard",
  ]) {
    assert.ok(shellSource.includes(section), `missing ${section}`);
  }
  assert.ok(shellSource.includes("<StageCards stages={data.stages} onViewStage={onViewStage} />"));
  assert.ok(shellSource.includes("workstreams={data.workstreams}"));
  assert.ok(shellSource.includes("<UpcomingDatesCard dates={data.upcomingDates} />"));
  assert.ok(shellSource.includes("<BlockersCard blockers={data.blockers} />"));
  assert.ok(shellSource.includes("<HealthCard health={data.health} />"));
});

test("dashboard stage cards use an intrinsic responsive grid", () => {
  assert.ok(shellSource.includes('style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}'));
  assert.ok(shellSource.includes('className="min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"'));
  assert.ok(shellSource.includes('className="flex min-w-0 items-start justify-between gap-2"'));
  assert.ok(shellSource.includes('className="min-w-0 text-sm font-semibold leading-5 text-slate-900"'));
  assert.ok(shellSource.includes("shrink-0 rounded-full"));
  assert.ok(shellSource.includes('className="mt-2 w-full"'));
});

test("dashboard stage cards open Matrix with the canonical selected stage", () => {
  assert.ok(shellSource.includes("onViewStage?: (stage: TimelinePlanningStage) => void;"));
  assert.ok(shellSource.includes("<StageCards stages={data.stages} onViewStage={onViewStage} />"));
  assert.ok(shellSource.includes('type="button"'));
  assert.ok(shellSource.includes("onClick={() => onViewStage?.(stage.stage)}"));
  assert.ok(shellSource.includes('aria-label={`View ${stage.label} stage items`}'));
  assert.ok(shellSource.includes("cursor-pointer"));
  assert.ok(shellSource.includes("hover:border-slate-300 hover:shadow-md"));

  assert.ok(pageSource.includes("const viewStageItems = useCallback((stage: TimelinePlanningStage) => {"));
  assert.ok(pageSource.includes('setViewMode("LIST");'));
  assert.ok(pageSource.includes("setFilterStage(stage);"));
  assert.ok(pageSource.includes('params.set("view", "LIST");'));
  assert.ok(pageSource.includes('params.set("stage", stage);'));
  assert.ok(pageSource.includes("router.push(`?${params.toString()}`);"));
  assert.ok(pageSource.includes("onViewStage={viewStageItems}"));
});

test("roadmap toolbar keeps view controls and summaries with shared collapsed filters", () => {
  assert.ok(pageSource.includes("eventModuleClasses.controlRow} min-w-0"));
  assert.ok(pageSource.includes("eventModuleClasses.viewToggle} flex-wrap"));
  assert.ok(pageSource.includes("const usesTimelineShellFilters = viewMode !== \"LIST\";"));
  assert.ok(pageSource.includes('data-testid="timeline-shell-filters-toggle"'));
  assert.ok(pageSource.includes('data-testid="timeline-shell-filter-panel"'));
  assert.ok(pageSource.includes("TABLE_CONTROL_BUTTON_CLASS"));
  assert.ok(pageSource.includes("shrink-0 whitespace-nowrap rounded-full bg-rose-50"));
  assert.ok(pageSource.includes("flex min-w-[220px] flex-1 flex-wrap items-center gap-2"));
});

test("dashboard surfaces unassigned workstream items as helper text, not a card", () => {
  assert.ok(shellSource.includes("data.totals.unassignedWorkstreamItems > 0"));
  assert.ok(shellSource.includes("items have"));
  assert.ok(shellSource.includes("no workstream"));
  assert.ok(shellSource.includes("List View workstream filter"));
});

test("list view keeps Unassigned available as a workstream cleanup filter", () => {
  assert.ok(listSource.includes('<option value="UNASSIGNED">Unassigned workstream</option>'));
  assert.ok(listSource.includes('filters.workstream === "UNASSIGNED"'));
});

test("workstream detail panel surfaces the required subsections", () => {
  assert.ok(shellSource.includes("Readiness Checklist"));
  assert.ok(shellSource.includes("Key Dates"));
  assert.ok(shellSource.includes("Owners"));
  assert.ok(shellSource.includes("Recent Activity"));
  assert.ok(shellSource.includes("View all items"));
});

test("dashboard provides empty states and does not fake recent activity", () => {
  assert.ok(shellSource.includes("No upcoming due dates."));
  assert.ok(shellSource.includes("No active blockers"));
  assert.ok(shellSource.includes("No owners assigned"));
  assert.ok(shellSource.includes("recentActivityAvailable"));
  assert.ok(shellSource.includes("isn’t tracked for timeline items yet"));
});

test("dashboard does not hardcode the target screenshot sample data", () => {
  for (const sample of ["Olivia", "Menu selection", "Keynote contract", "Expo floor plan"]) {
    assert.equal(shellSource.includes(sample), false, `should not hardcode "${sample}"`);
  }
});
