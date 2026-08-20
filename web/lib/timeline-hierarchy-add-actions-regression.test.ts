import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const ganttSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");
const groupSummarySource = readFileSync("lib/timeline/group-summary.ts", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex >= 0, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const workstreamRowSource = sourceBetween(
  ganttSource,
  'if (row.kind === "DEPARTMENT")',
  'if (row.kind === "INLINE_CREATE")',
);

test("timeline hierarchy workstreams are collapsed by default on first load", () => {
  assert.ok(ganttSource.includes("const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());"));
  assert.ok(ganttSource.includes("if (!expandedCategories.has(group.key)) continue;"));
  assert.ok(workstreamRowSource.includes("const isCollapsed = !expandedCategories.has(row.group.key);"));
});

test("timeline hierarchy chevron expands and collapses a workstream", () => {
  assert.ok(workstreamRowSource.includes("setExpandedCategories((current) => {"));
  assert.ok(workstreamRowSource.includes("if (next.has(row.group.key)) next.delete(row.group.key);"));
  assert.ok(workstreamRowSource.includes("else next.add(row.group.key);"));
  assert.ok(workstreamRowSource.includes('aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${row.group.label} workstream`}'));
  assert.ok(workstreamRowSource.includes("isCollapsed ? <ChevronRight"));
});

test("timeline hierarchy no longer reserves a large boxed Add item control in workstream rows", () => {
  assert.doesNotMatch(workstreamRowSource, /ml-auto flex items-center gap-1 opacity-100 transition-opacity/);
  assert.doesNotMatch(workstreamRowSource, /rounded-md border border-slate-200 bg-white px-2 py-1/);
});

test("row-level Add item is contextual on hover and keyboard focus, anchored beside row content", () => {
  assert.ok(workstreamRowSource.includes("pointer-events-none hidden"));
  assert.ok(workstreamRowSource.includes("group-hover:pointer-events-auto group-hover:opacity-100"));
  assert.ok(workstreamRowSource.includes("group-focus-within:pointer-events-auto group-focus-within:opacity-100"));
  assert.ok(workstreamRowSource.includes("sm:inline-flex"));
  assert.ok(workstreamRowSource.indexOf("{itemCount}") < workstreamRowSource.indexOf('aria-label={`Add item to ${row.group.label}`}'));
  assert.ok(workstreamRowSource.indexOf('aria-label={`Add item to ${row.group.label}`}') < workstreamRowSource.indexOf("relative border-l border-slate-200"));
});

test("row-level Add item picks up the workstream accent color", () => {
  assert.ok(ganttSource.includes("function workstreamActionTone(workstream: string)"));
  assert.ok(ganttSource.includes('case "HOUSING"'));
  assert.ok(ganttSource.includes("border-sky-300 text-sky-700 hover:bg-sky-50 focus:ring-sky-200"));
  assert.ok(ganttSource.includes('case "FNB"'));
  assert.ok(ganttSource.includes("border-orange-300 text-orange-700 hover:bg-orange-50 focus:ring-orange-200"));
  assert.ok(ganttSource.includes('case "MARKETING"'));
  assert.ok(ganttSource.includes("border-pink-300 text-pink-700 hover:bg-pink-50 focus:ring-pink-200"));
  assert.ok(workstreamRowSource.includes("actionTone.button"));
});

test("collapsed workstream row no longer renders date ranges", () => {
  assert.equal(ganttSource.includes("function formatShortDate(date: Date | null): string"), false);
  assert.equal(ganttSource.includes("function formatCompactRange(schedule: ItemSchedule): string"), false);
  assert.equal(workstreamRowSource.includes("formatCompactRange(row.group.schedule)"), false);
  assert.equal(workstreamRowSource.includes("formatRange(row.group.schedule)"), false);
});

test("collapsed workstream row renders one circular count badge without item wording", () => {
  assert.equal(ganttSource.includes("ListTree"), false);
  assert.equal(workstreamRowSource.includes("<ListTree"), false);
  assert.ok(workstreamRowSource.includes("getTimelineGroupSummary(row.group.tasks)"));
  assert.ok(workstreamRowSource.includes("{itemCount}"));
  assert.ok(workstreamRowSource.includes("${itemCount} ${itemCount === 1 ? \"item\" : \"items\"}"));
  assert.ok(workstreamRowSource.includes("h-8 min-w-8"));
  assert.ok(workstreamRowSource.includes("rounded-full"));
  assert.ok(workstreamRowSource.includes("countBadgeTone"));
  assert.ok(workstreamRowSource.includes("hasHealthIssue"));
  assert.ok(workstreamRowSource.includes('gridTemplateColumns: "1.75rem 2.25rem minmax(0, auto) minmax(0, 1fr) auto"'));
  assert.ok(workstreamRowSource.indexOf("<ChevronRight") < workstreamRowSource.indexOf("aria-label={countBadgeLabel}"));
  assert.ok(workstreamRowSource.indexOf("aria-label={countBadgeLabel}") < workstreamRowSource.indexOf("${theme.badge}"));
  assert.ok(workstreamRowSource.indexOf("${theme.badge}") < workstreamRowSource.indexOf("Next due {formatDate(row.group.nextDueDate)}"));
  assert.equal(workstreamRowSource.includes(">item<"), false);
  assert.equal(workstreamRowSource.includes(">items<"), false);
});

test("workstream rows derive the badge from rendered items and only the canonical critical-path field", () => {
  assert.ok(ganttSource.includes("atRiskCount"));
  assert.ok(ganttSource.includes("overdueCount"));
  assert.ok(ganttSource.includes("nextDueDate"));
  assert.ok(ganttSource.includes("function workstreamHasHealthIssue"));
  assert.ok(ganttSource.includes("function workstreamCountBadgeTone"));
  assert.ok(ganttSource.includes("return group.overdueCount > 0 || group.atRiskCount > 0;"));
  assert.equal(ganttSource.includes("return group.overdueCount > 0 || group.atRiskCount > 0 || group.criticalCount > 0;"), false);
  assert.ok(workstreamRowSource.includes("const hasHealthIssue = workstreamHasHealthIssue(row.group);"));
  assert.ok(workstreamRowSource.includes("const { itemCount, hasCriticalPath } = getTimelineGroupSummary(row.group.tasks);"));
  assert.ok(workstreamRowSource.includes("const countBadgeTone = workstreamCountBadgeTone(hasHealthIssue);"));
  assert.ok(ganttSource.includes("bg-rose-500"));
  assert.ok(ganttSource.includes("bg-emerald-500"));
  assert.ok(workstreamRowSource.includes("{hasCriticalPath ? <Flame"));
  assert.ok(groupSummarySource.includes("items.some((item) => item.isCriticalPath)"));
  assert.equal(groupSummarySource.includes('priority === "CRITICAL"'), false);
  assert.ok(workstreamRowSource.includes("Next due {formatDate(row.group.nextDueDate)}"));
  assert.ok(workstreamRowSource.includes('hasCriticalPath ? ", includes critical path" : ""'));
  assert.equal(workstreamRowSource.includes("criticalCount"), false);
});

test("row-level Add item opens the existing create flow with that workstream preselected", () => {
  assert.ok(workstreamRowSource.includes('aria-label={`Add item to ${row.group.label}`}'));
  assert.ok(workstreamRowSource.includes('onOpenItemCreate(row.group.key as TimelineWorkstream | "UNASSIGNED")'));
  assert.ok(pageSource.includes("resetCreateForm(\"item\", workstream);"));
});

test("Timeline Hierarchy header exposes Add workstream separately from row-level Add item", () => {
  assert.ok(ganttSource.includes("onAddWorkstream?: () => void;"));
  assert.ok(ganttSource.includes("onClick={onAddWorkstream}"));
  assert.ok(ganttSource.includes("<span>Timeline hierarchy</span>"));
  assert.ok(pageSource.includes("onAddWorkstream={openCreateWorkstreamModal}"));
});

test("touch and narrow layouts reveal inline Add item on row selection", () => {
  assert.ok(ganttSource.includes("const [revealedMobileWorkstreamKey, setRevealedMobileWorkstreamKey] = useState<string | null>(null);"));
  assert.ok(workstreamRowSource.includes("setRevealedMobileWorkstreamKey((current) => (current === row.group.key ? null : row.group.key))"));
  assert.ok(workstreamRowSource.includes("isMobileActionRevealed"));
  assert.ok(workstreamRowSource.includes("sm:hidden"));
  assert.ok(workstreamRowSource.includes("Add item to {row.group.label}"));
  assert.ok(workstreamRowSource.includes("actionTone.mobileButton"));
});

test("workstream rows do not render the far-right kebab action rail or popover", () => {
  assert.equal(ganttSource.includes("MoreVertical"), false);
  assert.equal(ganttSource.includes("openWorkstreamMenuKey"), false);
  assert.equal(workstreamRowSource.includes('aria-haspopup="menu"'), false);
  assert.equal(workstreamRowSource.includes('role="menu"'), false);
  assert.equal(workstreamRowSource.includes('role="menuitem"'), false);
  assert.equal(workstreamRowSource.includes("absolute right-3 top-1/2"), false);
  assert.equal(workstreamRowSource.includes("top-[calc(100%+0.25rem)]"), false);
});

test("timeline view modes use a responsive fixed-column model instead of horizontal scrolling", () => {
  assert.ok(ganttSource.includes("const TIMELINE_MIN_COLUMN_WIDTH = 132;"));
  assert.ok(ganttSource.includes("const TIMELINE_MIN_VISIBLE_COLUMNS = 3;"));
  assert.ok(ganttSource.includes("const TIMELINE_MAX_VISIBLE_COLUMNS = 10;"));
  assert.ok(ganttSource.includes("function visibleColumnCountForWidth(chartWidth: number): number"));
  assert.ok(ganttSource.includes("Math.floor(chartWidth / TIMELINE_MIN_COLUMN_WIDTH)"));
  assert.ok(ganttSource.includes("function buildTimelineExtent("));
  assert.ok(ganttSource.includes("function buildVisibleTimelineWindow(extent: TimelineWindow, zoomLevel: ZoomLevel, windowOffset: number, visibleColumnCount: number)"));
  assert.ok(ganttSource.includes("const visibleColumnCount = visibleColumnCountForWidth(canvasWidth);"));
  assert.ok(ganttSource.includes("const [windowOffset, setWindowOffset] = useState(0);"));
  assert.ok(ganttSource.includes("Previous"));
  assert.ok(ganttSource.includes("Today"));
  assert.ok(ganttSource.includes("Next"));
  assert.ok(ganttSource.includes('className="max-h-[720px] overflow-y-auto overflow-x-hidden"'));
  assert.ok(ganttSource.includes("const GRID_TEMPLATE = `${LEFT_COLUMN_WIDTH}px minmax(0, 1fr)`;"));
});

test("Week Month and Quarter render the same visible column count with different units", () => {
  assert.ok(ganttSource.includes("function addTimelineColumns(date: Date, zoomLevel: ZoomLevel, columns: number): Date"));
  assert.ok(ganttSource.includes('if (zoomLevel === "WEEK") return addDays(date, columns * 7);'));
  assert.ok(ganttSource.includes('if (zoomLevel === "MONTH") return addMonths(date, columns);'));
  assert.ok(ganttSource.includes("return addMonths(date, columns * 3);"));
  assert.ok(ganttSource.includes("for (let index = 0; index < visibleColumnCount; index += 1)"));
  assert.ok(ganttSource.includes("const date = addTimelineColumns(windowRange.start, zoomLevel, index);"));
  assert.ok(ganttSource.includes("label: zoomLevel === \"WEEK\" ? weekFmt.format(date) : zoomLevel === \"MONTH\" ? monthFmt.format(date) : formatQuarterLabel(date)"));
  assert.ok(ganttSource.includes("const columnWidth = canvasWidth / visibleColumnCount;"));
  assert.ok(ganttSource.includes("labelX: dateToPx(tick.date) + columnWidth / 2"));
  assert.equal(ganttSource.includes("function thinTicks("), false);
  assert.equal(ganttSource.includes("VISIBLE_WINDOW_DAYS"), false);
  assert.equal(ganttSource.includes('const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });'), false);
});

test("timeline bars clip to the visible window instead of forcing horizontal overflow", () => {
  assert.ok(ganttSource.includes("schedule.end.getTime() < timelineWindow.start.getTime() || schedule.start.getTime() > timelineWindow.end.getTime()"));
  assert.ok(ganttSource.includes("const clippedStart = new Date(Math.max(schedule.start.getTime(), timelineWindow.start.getTime()));"));
  assert.ok(ganttSource.includes("const clippedEnd = new Date(Math.min(schedule.end.getTime(), timelineWindow.end.getTime()));"));
  assert.ok(ganttSource.includes('startsBeforeWindow ? "rounded-l-sm" : ""'));
  assert.ok(ganttSource.includes('endsAfterWindow ? "rounded-r-sm" : ""'));
});

test("timeline items open a lightweight quick-edit panel from row labels and bars", () => {
  assert.ok(ganttSource.includes("type QuickEditDraft"));
  assert.ok(ganttSource.includes("const openQuickEdit = useCallback((item: TimelineItemRecord) =>"));
  assert.ok(ganttSource.includes("onClick={() => openQuickEdit(task)}"));
  assert.ok(ganttSource.includes("() => openQuickEdit(task)"));
  assert.ok(ganttSource.includes("Quick edit"));
  assert.ok(ganttSource.includes("role=\"dialog\""));
  assert.ok(ganttSource.includes("pointer-events-none fixed inset-0 z-[90]"));
});

test("quick edit prioritizes operational roadmap fields and saves through the timeline item patch path", () => {
  for (const field of [
    "Item name",
    "Status",
    "Priority",
    "Due date",
    "Owner",
    "Stage",
    "Workstream",
    "Critical path",
  ]) {
    assert.ok(ganttSource.includes(field), `missing quick edit field: ${field}`);
  }
  assert.ok(ganttSource.includes("onSaveItem: (itemId: string, patch: TimelineItemPatch) => Promise<void>;"));
  assert.ok(ganttSource.includes("await onSaveItem(quickEditItem.id"));
  assert.ok(ganttSource.includes("ownerUserId: quickEditDraft.ownerUserId || null"));
  assert.ok(ganttSource.includes("isCriticalPath: quickEditDraft.isCriticalPath"));
  assert.ok(ganttSource.includes("workstream: quickEditDraft.workstream || null"));
  assert.ok(pageSource.includes("onSaveItem={handleSaveRow}"));
});

test("roadmap item quick edit does not expose generic task management", () => {
  assert.equal(ganttSource.includes("function LinkedRoadmapTasksAccordion"), false);
  assert.equal(ganttSource.includes("Linked tasks · ${countLabel}"), false);
  assert.equal(ganttSource.includes("listObjectTasks(eventId, \"TIMELINE_ITEM\", itemId"), false);
  assert.equal(ganttSource.includes("objectType=\"TIMELINE_ITEM\""), false);
  assert.equal(ganttSource.includes("createHelperCopy=\"Creates a canonical task linked to this roadmap item.\""), false);
  assert.equal(ganttSource.includes("Add task"), false);
  assert.equal(ganttSource.includes("Task title is required."), false);
  assert.equal(ganttSource.includes("Failed to update roadmap task."), false);
});
