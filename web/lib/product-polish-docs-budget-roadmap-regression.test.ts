import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const timelinePageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const eventShellSource = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const commandCenterCss = readFileSync("app/(shell)/events/[eventId]/_components/event-command-center.module.css", "utf8");
const commandCenterSource = readFileSync("app/(shell)/events/[eventId]/_components/event-command-center.tsx", "utf8");
const commandCenterRenderer = readFileSync("app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx", "utf8");
const dashboardTokens = readFileSync("app/dashboard-tokens.css", "utf8");
const accountDashboardCss = readFileSync("app/(shell)/dashboard/dashboard.module.css", "utf8");
const documentsServiceSource = readFileSync("src/server/services/documents.ts", "utf8");
const fnbParseRouteSource = readFileSync("app/api/events/[eventId]/fnb-catalog/parse-menu/route.ts", "utf8");
const budgetServiceSource = readFileSync("src/server/services/budget.ts", "utf8");
const eventBuilderDocsSource = readFileSync("lib/documents-upload-client.ts", "utf8");

test("Roadmap view selector keeps Matrix and Workstream labels without changing view values", () => {
  const viewModes = timelinePageSource.slice(
    timelinePageSource.indexOf("const VIEW_MODES"),
    timelinePageSource.indexOf("const STATUS_OPTIONS"),
  );

  const dashboardIndex = viewModes.indexOf('value: "DASHBOARD"');
  const listIndex = viewModes.indexOf('value: "LIST"');
  const roadmapIndex = viewModes.indexOf('value: "TIMELINE"');
  const boardIndex = viewModes.indexOf('value: "BOARD"');

  assert.ok(dashboardIndex >= 0, "Dashboard view remains present");
  assert.ok(listIndex > dashboardIndex, "Matrix/List value is second");
  assert.ok(roadmapIndex > listIndex, "Workstream/Timeline value remains after Matrix");
  assert.ok(boardIndex > roadmapIndex, "Board remains last");
  assert.match(viewModes, /\{ value: "LIST", label: "Matrix" \}/);
  assert.match(viewModes, /\{ value: "TIMELINE", label: "Workstream" \}/);
  assert.doesNotMatch(viewModes, /\{ value: "LIST", label: "List" \}/);
  assert.doesNotMatch(viewModes, /\{ value: "TIMELINE", label: "Roadmap" \}/);
});

test("non-Docs document-like uploads route into Docs Hub without duplicating existing flows", () => {
  assert.match(eventBuilderDocsSource, /\/api\/events\/\$\{eventId\}\/documents/);
  assert.match(budgetServiceSource, /createDocumentDraft\(eventId/);
  assert.match(budgetServiceSource, /finalizeDocumentUpload\(/);

  assert.match(fnbParseRouteSource, /createDocumentVersionFromEventObject/);
  assert.match(fnbParseRouteSource, /categorySlug: "catering"/);
  assert.match(fnbParseRouteSource, /fileSizeBytes: input\.pdfBytes\.byteLength/);

  assert.match(documentsServiceSource, /documentVersion\.findFirst\(\{\s*where:\s*\{\s*objectKey,/);
  assert.match(documentsServiceSource, /ensureEventScopedObjectKey\(eventId, objectKey\)/);
});

test("Budget category totals use persisted line-item Forecast and Actual without creating targets", () => {
  assert.match(documentsServiceSource, /function ensureEventScopedObjectKey/);
  assert.match(
    readFileSync("src/server/services/budget-sessions-groups.ts", "utf8"),
    /remainingCents: health\.remainingCents/,
  );
  assert.doesNotMatch(
    readFileSync("src/server/services/budget-sessions-groups.ts", "utf8"),
    /createMany\([^)]*BudgetCategoryTarget/,
  );
});

test("event selector has native dropdown search and clean empty state", () => {
  assert.match(eventShellSource, /eventSelectorSearch/);
  assert.match(eventShellSource, /filteredEvents/);
  assert.match(eventShellSource, /placeholder="Search events"/);
  assert.match(eventShellSource, /No events match your search\./);
  assert.match(eventShellSource, /selectorSearchInputRef\.current\?\.focus\(\)/);
});

test("Financial Reports is hidden from visible event navigation only", () => {
  assert.doesNotMatch(eventShellSource, /label: "Financial Reports"/);
  assert.match(eventShellSource, /Financial Reports is intentionally hidden from navigation for now/);
  assert.match(eventShellSource, /The route remains available for direct links/);
});

test("event Command Center styling follows the account dashboard visual system", () => {
  assert.match(commandCenterCss, /--event-color-primary: #28439a/);
  assert.match(dashboardTokens, /--dashboard-page-background:[\s\S]*radial-gradient\(circle at 20% 0%/);
  assert.match(dashboardTokens, /--dashboard-page-padding: 16px clamp\(20px, 2vw, 36px\) 32px/);
  assert.match(commandCenterCss, /background: var\(--dashboard-page-background\)/);
  assert.match(commandCenterCss, /padding: var\(--dashboard-page-padding\)/);
  assert.match(commandCenterCss, /border: var\(--dashboard-card-border\)/);
  assert.match(commandCenterCss, /box-shadow: var\(--dashboard-kpi-shadow\)/);
  assert.match(accountDashboardCss, /background: var\(--dashboard-page-background\)/);
  assert.match(accountDashboardCss, /border: var\(--dashboard-card-border\)/);
  assert.match(accountDashboardCss, /box-shadow: var\(--dashboard-kpi-shadow\)/);
  assert.match(commandCenterCss, /\.commandTitle[\s\S]*font-weight: 400/);
  assert.match(commandCenterCss, /\.primaryButton[\s\S]*background: var\(--orca-blue\)/);
});

test("event Command Center header renders only the event name and date range as event identity", () => {
  const headerSource = commandCenterSource.slice(
    commandCenterSource.indexOf('<header className={styles.commandHeader}>'),
    commandCenterSource.indexOf("</header>"),
  );

  assert.match(headerSource, /<h1 className=\{styles\.commandTitle\}>\{data\.event\.name\}<\/h1>/);
  assert.match(headerSource, /<p className=\{styles\.commandDateRange\}>\{eventDateRange\}<\/p>/);
  assert.doesNotMatch(headerSource, /commandEyebrow|headerMeta|phaseChip|headerVerdict|verdictBadge|daysLabel|venue|generatedAt/);
  assert.match(commandCenterCss, /\.commandDateRange[\s\S]*font-weight: 400/);
  assert.match(commandCenterCss, /@media \(max-width: 768px\)[\s\S]*\.commandHeader \{[\s\S]*display: grid/);
  assert.match(commandCenterCss, /@media \(max-width: 480px\)[\s\S]*\.commandTitle \{[\s\S]*font-size: 26px/);
});

test("event Command Center keeps responsive content and edit affordances scoped", () => {
  assert.match(commandCenterCss, /\.actionList > li,[\s\S]*min-width: 0/);
  assert.match(commandCenterCss, /react-grid-item:not\(\.react-resizable-hide\) > \.react-resizable-handle/);
  assert.match(commandCenterCss, /\.widgetFrameBody > \.kpiGrid[\s\S]*overflow-x: auto/);
  assert.match(commandCenterCss, /@container \(max-width: 560px\)[\s\S]*\.conflictsLayout/);
  assert.match(commandCenterRenderer, /<li key=\{item\.id\}>/);
  assert.match(commandCenterRenderer, /aria-label=\{`\$\{item\.title\}\. \$\{item\.detail\}\. \$\{item\.dueLabel\}`\}/);
});

test("event Command Center KPI row mirrors the account six-card metric structure", () => {
  const kpiRowSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function KpiRowWidget"),
    commandCenterRenderer.indexOf("function UpcomingDeadlinesWidget"),
  );
  const labels = ["DAYS TO EVENT", "AT RISK", "BUDGET", "APPROVALS", "DEADLINES", "SPEAKERS"];

  let previousIndex = -1;
  for (const label of labels) {
    const index = kpiRowSource.indexOf(`label="${label}"`);
    assert.ok(index > previousIndex, `${label} renders in the expected KPI order`);
    previousIndex = index;
  }

  assert.equal((kpiRowSource.match(/<KpiCard/g) ?? []).length, 6);
  assert.doesNotMatch(kpiRowSource, /Pending Approvals|Operational Blockers|Overdue Items/);
  assert.match(kpiRowSource, /data\.event\.KPIs\.blockers\.atRiskTimelineItems/);
  assert.match(kpiRowSource, /data\.event\.speakers\.tasksPending/);
  assert.match(commandCenterCss, /\.kpiGrid \{[\s\S]*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(commandCenterCss, /\.kpiCard \{[\s\S]*min-height: var\(--dashboard-kpi-min-height\)/);
  assert.match(commandCenterCss, /\.kpiLabel \{[\s\S]*font-weight: 500/);
  assert.match(commandCenterCss, /\.kpiValue \{[\s\S]*font-weight: 500/);
  assert.doesNotMatch(commandCenterCss, /@container \(max-width: 1180px\)[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(commandCenterCss, /@container \(max-width: 720px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(commandCenterCss, /@container \(max-width: 480px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(commandCenterSource, /isEditing \? layout : buildKpiPresentationLayout\(layout, canvasWidth\)/);
  assert.match(commandCenterSource, /canvasWidth >= 480 \? 5 : 10/);
});

test("event Command Center critical dates widget uses precise empty state and conditional View all", () => {
  const widgetSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function UpcomingDeadlinesWidget"),
    commandCenterRenderer.indexOf("function RoadmapProgressWidget"),
  );

  assert.match(widgetSource, /const hasAdditionalDeadlines = data\.event\.deadlines\.length > 5/);
  assert.match(
    widgetSource,
    /action=\{hasAdditionalDeadlines \? <WidgetAction href=\{eventTimelineListHref\(data\.event\.id\)\} label="View all" \/> : undefined\}/,
  );
  assert.equal(widgetSource.includes("No upcoming critical dates"), true);
  assert.equal(widgetSource.includes("No upcoming deadlines"), false);
  assert.match(widgetSource, /data\.event\.deadlines\.slice\(0, 5\)\.map/);
  assert.match(widgetSource, /formatMonthDayParts\(deadline\.eventDate\)/);
  assert.match(widgetSource, /className=\{cx\(styles\.actionRow, styles\.criticalDateRow\)\}/);
  assert.match(widgetSource, /className=\{cx\(styles\.dateBadge, styles\.criticalDateBadge\)\}/);
  assert.match(widgetSource, /className=\{styles\.criticalDateContent\}/);
  assert.match(widgetSource, /title=\{deadline\.title\}/);
  assert.match(widgetSource, /className=\{cx\(styles\.pill, styles\.criticalDateTiming, styles\[`pill\$\{timingTone\}`\]\)\}/);
  assert.match(commandCenterCss, /\.criticalDateRow \{[\s\S]*grid-template-columns: 48px minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(commandCenterCss, /\.criticalDateRow \{[^}]*grid-template-columns: 1fr/);
});

test("event Command Center top row uses operational hierarchy titles", () => {
  const readinessSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function ReadinessDashboardWidget"),
    commandCenterRenderer.indexOf("function SessionReadinessWidget"),
  );
  const conflictsSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function ConflictsDetailsWidget"),
    commandCenterRenderer.indexOf("function RegistrationPaceWidget"),
  );

  assert.match(readinessSource, /title="Operational Readiness"/);
  assert.match(conflictsSource, /title="Open Conflicts"/);
  assert.equal(commandCenterRenderer.includes('title="Readiness Dashboard"'), false);
  assert.equal(commandCenterRenderer.includes('title="Conflicts & Details"'), false);
});

test("Operational Readiness rows prioritize canonical status, evidence, and drill-through", () => {
  const readinessSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function ReadinessDashboardWidget"),
    commandCenterRenderer.indexOf("function SessionReadinessWidget"),
  );

  assert.match(readinessSource, /const readinessRows = data\.event\.operationalReadiness/);
  assert.match(readinessSource, /statusCounts\.critical > 0 \? "critical"/);
  assert.match(readinessSource, /aria-label="Operational readiness status counts"/);
  assert.match(readinessSource, /aria-label=\{`\$\{row\.label\}: \$\{row\.statusLabel\}\. \$\{row\.detail\}`\}/);
  assert.match(readinessSource, /href=\{row\.href\}/);
  assert.match(readinessSource, /styles\[`pill\$\{row\.status\}`\]/);
  assert.doesNotMatch(readinessSource, /readinessStatus\(|row\.percent/);
  assert.match(commandCenterCss, /\.operationalReadinessRow \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto auto/);
});

test("event Command Center roadmap progress widget summarizes planning tasks instead of milestones only", () => {
  const widgetSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function RoadmapProgressWidget"),
    commandCenterRenderer.indexOf("function EventBudgetOverviewWidget"),
  );

  assert.match(widgetSource, /const roadmap = data\.event\.roadmapProgress/);
  assert.match(widgetSource, /title="Planning Progress"/);
  assert.match(widgetSource, /roadmap\.percentComplete/);
  assert.match(widgetSource, /roadmap\.completed/);
  assert.match(widgetSource, /roadmap\.inProgress/);
  assert.match(widgetSource, /roadmap\.notStarted/);
  assert.match(widgetSource, /roadmap\.atRisk/);
  assert.match(widgetSource, /roadmap\.upcomingItems/);
  assert.equal(widgetSource.includes("No roadmap has been created yet."), true);
  assert.equal(widgetSource.includes("No roadmap milestones or dated items yet."), false);
});

test("event Command Center conflicts donut visualizes severity distribution", () => {
  const widgetSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function ConflictsDetailsWidget"),
    commandCenterRenderer.indexOf("function RegistrationPaceWidget"),
  );
  const donutSource = commandCenterRenderer.slice(
    commandCenterRenderer.indexOf("function ConflictDistributionDonut"),
    commandCenterRenderer.indexOf("function MiniBars"),
  );

  assert.match(commandCenterRenderer, /getConflictDistributionModel/);
  assert.match(widgetSource, /<ConflictDistributionDonut[\s\S]*critical=\{criticalCount\}[\s\S]*warning=\{warningCount\}[\s\S]*neutral=\{neutralCount\}/);
  assert.doesNotMatch(widgetSource, /criticalCount \/ Math\.max/);
  assert.match(donutSource, /aria-label=\{model\.summary\}/);
  assert.match(donutSource, /<span className=\{styles\.donutValue\}>\{model\.total\}<\/span>/);
  assert.match(donutSource, /<span className=\{styles\.donutLabel\}>\{model\.conflictLabel\}<\/span>/);
  assert.match(commandCenterCss, /--conflict-critical-color: #e11d48/);
  assert.match(commandCenterCss, /--conflict-warning-color: #f59e0b/);
  assert.match(commandCenterCss, /--conflict-neutral-color: #cbd5e1/);
  assert.match(commandCenterCss, /conic-gradient\([\s\S]*var\(--conflict-critical-color\)[\s\S]*var\(--conflict-warning-color\)[\s\S]*var\(--conflict-neutral-color\)/);
});
