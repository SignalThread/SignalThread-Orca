import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventDashboardSource = readFileSync("app/(shell)/events/[eventId]/_components/event-command-center.tsx", "utf8");
const eventWidgetSource = readFileSync("app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx", "utf8");
const budgetDashboardSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-dashboard.tsx", "utf8");
const roadmapDashboardSource = readFileSync("app/(shell)/timeline/_components/TimelineDashboardView.tsx", "utf8");
const roadmapPageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const runOfShowSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const fnbCatalogSource = readFileSync("app/(shell)/events/[eventId]/fnb-catalog/_components/fnb-catalog-workspace.tsx", "utf8");
const sharedEmptyStateSource = readFileSync("components/dashboard-empty-state.tsx", "utf8");

test("dashboard empty state pattern is shared and product-grade", () => {
  assert.ok(sharedEmptyStateSource.includes("export function DashboardEmptyState"));
  assert.ok(sharedEmptyStateSource.includes("primaryAction"));
  assert.ok(sharedEmptyStateSource.includes("secondaryAction"));
  assert.ok(sharedEmptyStateSource.includes("bullets"));
  assert.ok(sharedEmptyStateSource.includes("sm:flex-row"));
  assert.ok(budgetDashboardSource.includes("DashboardEmptyState"));
  assert.ok(roadmapDashboardSource.includes("DashboardEmptyState"));
  assert.ok(runOfShowSource.includes("DashboardEmptyState"));
  assert.ok(eventDashboardSource.includes("DashboardEmptyState"));
  assert.ok(fnbCatalogSource.includes("DashboardEmptyState"));
});

test("blank event dashboard renders the product empty state with contextual actions", () => {
  assert.ok(eventDashboardSource.includes("function eventDashboardHasMeaningfulData"));
  assert.ok(eventDashboardSource.includes("No data yet"));
  assert.ok(eventDashboardSource.includes("Once you add planning data, this dashboard will summarize what needs attention across your event."));
  assert.ok(eventDashboardSource.includes("Start by importing planning files or adding your first Run of Show session, budget item, or roadmap item."));
  assert.ok(eventDashboardSource.includes('href="/events/new?method=workbook"'));
  assert.ok(eventDashboardSource.includes("Import planning files"));
  assert.ok(eventDashboardSource.includes("Add manually"));
});

test("module dashboards use contextual no-data copy instead of generic zero dashboards", () => {
  assert.ok(budgetDashboardSource.includes("No budget data yet"));
  assert.ok(budgetDashboardSource.includes("Import a budget spreadsheet or add your first line item"));
  assert.ok(runOfShowSource.includes("No sessions yet"));
  assert.ok(runOfShowSource.includes("Import a program matrix or add your first session"));
  assert.ok(roadmapDashboardSource.includes("No roadmap items yet"));
  assert.ok(roadmapDashboardSource.includes("Create roadmap items to track planning progress"));
  assert.ok(roadmapPageSource.includes("No timeline items yet"));
  assert.ok(roadmapPageSource.includes("Add roadmap items, deadlines, and dependencies"));
  assert.ok(fnbCatalogSource.includes("No F&B catalog yet"));
  assert.ok(fnbCatalogSource.includes("Upload a menu or spreadsheet"));
});

test("F&B catalog does not render demo starter menus when there is no real data", () => {
  assert.equal(fnbCatalogSource.includes("demo-main-menu"), false);
  assert.equal(fnbCatalogSource.includes("banquet-menu-2026.pdf"), false);
  assert.equal(fnbCatalogSource.includes("spring-price-refresh.pdf"), false);
  assert.ok(fnbCatalogSource.includes("const isEmptyCatalog = items.length === 0 && menus.length === 0 && amendments.length === 0"));
});

test("blank dashboards gate normal metric cards and chart/table shells behind real data checks", () => {
  assert.ok(
    budgetDashboardSource.indexOf("isEmptyBudget ? (") < budgetDashboardSource.indexOf("<KpiCard"),
    "budget empty state should render before budget KPI cards",
  );
  assert.ok(
    roadmapDashboardSource.indexOf("data.totals.totalItems === 0") < roadmapDashboardSource.indexOf("<StageCards"),
    "roadmap empty state should render before stage cards",
  );
  assert.ok(
    runOfShowSource.indexOf("isRunOfShowEmpty ? (") < runOfShowSource.indexOf("<Matrix2Board"),
    "Run of Show empty state should render before board shell",
  );
  assert.ok(
    runOfShowSource.includes("!isRunOfShowEmpty ? (") &&
      runOfShowSource.indexOf("!isRunOfShowEmpty ? (") < runOfShowSource.indexOf("<Matrix2TopStrip"),
    "Run of Show type/filter strip should not render for an empty schedule",
  );
  assert.ok(
    eventDashboardSource.includes("hasDashboardData ? (") &&
      eventDashboardSource.indexOf("hasDashboardData ? (") < eventDashboardSource.indexOf("<ResponsiveGridLayout"),
    "event dashboard widgets should render only when meaningful data exists",
  );
});

test("dashboard with real data keeps normal dashboard surfaces and widget-level empty states", () => {
  assert.ok(budgetDashboardSource.includes("BudgetBlocksSection eventId={eventId}"));
  assert.ok(budgetDashboardSource.includes('<EmptyPanel title="No budget actions pending."'));
  assert.ok(budgetDashboardSource.includes('<EmptyPanel title="No recent budget activity."'));
  assert.ok(eventWidgetSource.includes("No budget data yet."));
  assert.ok(eventWidgetSource.includes('label="DEADLINES"'));
  assert.ok(eventWidgetSource.includes("Roadmap Summary"));
  assert.equal(eventWidgetSource.includes("Overdue Tasks"), false);
  assert.equal(eventWidgetSource.includes("Task Summary"), false);
  assert.ok(roadmapDashboardSource.includes("data.totals.totalItems"));
});

test("empty state primary actions route or open the correct creation flows", () => {
  assert.ok(budgetDashboardSource.includes("Add line item"));
  assert.ok(budgetDashboardSource.includes("Import budget"));
  assert.ok(budgetDashboardSource.includes("budget?view=grid"));
  assert.ok(roadmapPageSource.includes("onAddMilestone={() => openInlineDraft(defaultInlineWorkstream, \"MILESTONE\")}"));
  assert.ok(roadmapPageSource.includes("onAddItem={() => openCreateItemModal()}"));
  assert.ok(roadmapPageSource.includes("Import timeline"));
  assert.ok(roadmapPageSource.includes("openImportModal()"));
  assert.ok(runOfShowSource.includes("onClick={handleOpenAddSession}"));
  assert.ok(runOfShowSource.includes("Add session"));
  assert.ok(runOfShowSource.includes("Import Run of Show"));
  assert.ok(runOfShowSource.includes("MatrixImportAction"));
});

test("loading states resolve before full empty states so blank panels do not flash", () => {
  assert.ok(
    budgetDashboardSource.indexOf("isLoading && !dashboard") < budgetDashboardSource.indexOf("isEmptyBudget ? ("),
  );
  assert.ok(
    roadmapDashboardSource.indexOf('state.phase === "loading"') <
      roadmapDashboardSource.indexOf("data.totals.totalItems === 0"),
  );
  assert.ok(runOfShowSource.includes("snapshot && !isLoadingSnapshot && !hasRunOfShowData"));
});
