import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync("app/(shell)/dashboard/page.tsx", "utf8");
const eventLauncherSource = readFileSync("app/(shell)/dashboard/EventLauncher.tsx", "utf8");
const dashboardStylesSource = readFileSync("app/(shell)/dashboard/dashboard.module.css", "utf8");
const dashboardServiceSource = readFileSync("src/server/services/command-center-dashboard.ts", "utf8");
const eventPortfolioSource = readFileSync("lib/account-event-portfolio.ts", "utf8");
const lifecycleSource = readFileSync("lib/event-lifecycle.ts", "utf8");
const sidebarSource = readFileSync("app/(shell)/_components/sidebar-nav.tsx", "utf8");
const eventsPageSource = readFileSync("app/(shell)/events/page.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Command Center removes quarter and status filter controls", () => {
  assert.equal(dashboardSource.includes("<QuarterFilterMenu"), false);
  assert.equal(dashboardSource.includes("QuarterFilterMenu"), false);
  assert.equal(dashboardSource.includes("selectedPeriod"), false);
  assert.equal(dashboardSource.includes("normalizeStatusFilter"), false);
  assert.equal(dashboardSource.includes("STATUS_FILTERS"), false);
  assert.equal(dashboardSource.includes(">Filters<"), false);
  assert.equal(dashboardSource.includes("All visible statuses"), false);
  assert.equal(dashboardSource.includes("Last updated"), false);
  assert.equal(dashboardSource.includes("Current overview of your events"), false);
});

test("Command Center renders the event launcher and create event action", () => {
  assert.equal(dashboardSource.includes('import { EventLauncher } from "./EventLauncher"'), true);
  assert.equal(dashboardSource.includes("<EventLauncher />"), true);
  assert.equal(eventLauncherSource.includes('data-testid="command-center-event-launcher"'), true);
  assert.equal(eventLauncherSource.includes('placeholder="Search events"'), true);
  assert.equal(eventLauncherSource.includes('fetch("/api/events"'), true);
  assert.equal(eventLauncherSource.includes("router.push(`/events/${event.id}`)"), true);
  assert.equal(eventLauncherSource.includes("Loading events..."), true);
  assert.equal(eventLauncherSource.includes("No events match your search."), true);
  assert.equal(eventLauncherSource.includes("Event list unavailable."), true);
});

test("Command Center create event shortcut opens the Event Builder", () => {
  assert.equal(dashboardSource.includes('href="/events/new"'), true);
  assert.equal(dashboardSource.includes('aria-label="Open Event Builder to create an event"'), true);
  assert.equal(dashboardSource.includes('title="Open Event Builder to create an event"'), true);
  assert.equal(dashboardSource.includes('aria-label="Open Events page to create an event"'), false);
});

test("Sidebar no longer exposes Events as a primary nav item", () => {
  assert.equal(sidebarSource.includes('href: "/events"'), false);
  assert.equal(sidebarSource.includes('label: "Events"'), false);
  assert.equal(sidebarSource.includes("Events list and create new event"), false);
});

test("/events redirects to Command Center instead of rendering the old management screen", () => {
  assert.equal(eventsPageSource.includes('redirect("/dashboard")'), true);
  assert.equal(eventsPageSource.includes("useEventsData"), false);
  assert.equal(eventsPageSource.includes("SearchAndFilterBar"), false);
  assert.equal(eventsPageSource.includes("Duplicate Existing Event"), false);
});

test("event lifecycle labels are harmonized in a shared contract", () => {
  assert.equal(lifecycleSource.includes('DRAFT: { label: "Planning"'), true);
  assert.equal(lifecycleSource.includes('ACTIVE: { label: "Live"'), true);
  assert.equal(lifecycleSource.includes('COMPLETED: { label: "Completed"'), true);
  assert.equal(lifecycleSource.includes('CANCELED: { label: "Canceled"'), true);
  assert.equal(dashboardSource.includes("getEventLifecycleLabel"), false);
  assert.equal(dashboardSource.includes('return "Active"'), false);
  assert.equal(dashboardSource.includes('return "Complete"'), false);
  assert.equal(dashboardSource.includes("eventStatusLabel("), false);
});

test("Event Portfolio renders four aligned actionable columns", () => {
  const portfolioSource = sourceBetween(
    dashboardSource,
    'title="Event Snapshot"',
    "</DashboardPanel>",
  );
  const portfolioGridStyles = sourceBetween(
    dashboardStylesSource,
    ".snapshotHeader,\n.snapshotRow {",
    ".snapshotHeader {",
  );

  assert.match(portfolioSource, /<span>Event<\/span>/);
  assert.match(portfolioSource, /<span>Next Critical Item<\/span>/);
  assert.match(portfolioSource, /<span>Budget<\/span>/);
  assert.match(portfolioSource, /<span>Health<\/span>/);
  assert.doesNotMatch(
    portfolioSource,
    /className=\{styles\.snapshotHeader\} aria-hidden/,
  );
  assert.doesNotMatch(portfolioSource, /<span>Status<\/span>/);
  assert.doesNotMatch(portfolioSource, /<span>Timeline<\/span>/);
  assert.doesNotMatch(portfolioSource, /<span[^>]*>Open<\/span>/);
  assert.match(portfolioGridStyles, /30fr/);
  assert.match(portfolioGridStyles, /35fr/);
  assert.match(portfolioGridStyles, /18fr/);
  assert.match(portfolioGridStyles, /17fr/);
});

test("Event Portfolio rows preserve event navigation and concise summaries", () => {
  assert.match(dashboardSource, /href=\{`\/events\/\$\{event\.id\}`\}/);
  assert.match(dashboardSource, /className=\{styles\.snapshotRow\}/);
  assert.match(dashboardSource, /summarizePortfolioBudget/);
  assert.match(dashboardSource, /summarizePortfolioHealth/);
  assert.match(eventPortfolioSource, /"Critical"/);
  assert.match(eventPortfolioSource, /"Needs Review"/);
  assert.match(eventPortfolioSource, /"On Track"/);
  assert.match(eventPortfolioSource, /"No budget"/);
  assert.match(dashboardSource, /"No immediate action"/);
  assert.doesNotMatch(dashboardSource, /`\$\{pendingApprovals\} pending`/);
  assert.doesNotMatch(dashboardSource, /`\$\{eventHealthCount\} signals`/);
});

test("Event Portfolio prioritizes and progressively reveals events responsively", () => {
  assert.match(dashboardSource, /eventPortfolioToneRank/);
  assert.match(dashboardSource, /Math\.abs\(daysFromToday\(left\.startDate, today\)\)/);
  assert.match(dashboardSource, /sortedPortfolioEvents\.slice\(0, 8\)/);
  assert.match(dashboardSource, /sortedPortfolioEvents\.slice\(8\)/);
  assert.match(dashboardSource, /View all \{sortedPortfolioEvents\.length\} events/);
  assert.match(dashboardStylesSource, /@container account-dashboard \(max-width: 700px\) \{[\s\S]*grid-template-areas:[\s\S]*"event event"[\s\S]*"critical critical"[\s\S]*"budget health"/);
  assert.match(dashboardStylesSource, /\.snapshotRow:focus-visible/);
  assert.match(dashboardServiceSource, /selectPortfolioCriticalItems/);
});

test("Command Center uses one full-width responsive container for the header, KPI row, and panels", () => {
  const pageSource = sourceBetween(
    dashboardStylesSource,
    ".dashboardPage {",
    ".dashboardShell {",
  );
  const shellSource = sourceBetween(
    dashboardStylesSource,
    ".dashboardShell {",
    ".dashboardHeader {",
  );
  const kpiSource = sourceBetween(
    dashboardStylesSource,
    ".kpiGrid {",
    ".kpiCard {",
  );
  const cardSource = sourceBetween(
    dashboardStylesSource,
    ".kpiCard {",
    ".kpiCard:hover {",
  );
  const headerSource = sourceBetween(
    dashboardStylesSource,
    ".dashboardHeader {",
    ".dashboardHeader > :first-child {",
  );
  const actionsSource = sourceBetween(
    dashboardStylesSource,
    ".dashboardActions {",
    ".eventLauncher {",
  );

  assert.match(pageSource, /container-type: inline-size/);
  assert.match(pageSource, /container-name: account-dashboard/);
  assert.match(shellSource, /width: 100%/);
  assert.match(shellSource, /min-width: 0/);
  assert.match(shellSource, /box-sizing: border-box/);
  assert.doesNotMatch(shellSource, /max-width/);
  assert.match(kpiSource, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(kpiSource, /width: 100%/);
  assert.match(kpiSource, /min-width: 0/);
  assert.match(cardSource, /width: 100%/);
  assert.match(cardSource, /min-width: 0/);
  assert.match(cardSource, /min-height: var\(--dashboard-kpi-min-height\)/);
  assert.match(cardSource, /background: rgba\(255, 255, 255, 0\.94\)/);
  assert.doesNotMatch(cardSource, /width: \d+px/);
  assert.doesNotMatch(cardSource, /min-width: (?!0)\d/);
  assert.match(dashboardStylesSource, /\.midGrid,\n\.lowerGrid \{[\s\S]*width: 100%[\s\S]*min-width: 0/);
  assert.match(dashboardStylesSource, /\.midGrid > \*,\n\.lowerGrid > \*,[\s\S]*min-width: 0/);
  assert.doesNotMatch(headerSource, /margin-bottom: -/);
  assert.doesNotMatch(actionsSource, /position: absolute/);
});

test("Command Center renders the six portfolio KPI cards in the desktop grid", () => {
  const kpiSectionSource = sourceBetween(
    dashboardSource,
    '<section className={styles.kpiGrid} data-testid="command-center-kpi-grid">',
    '<section className={styles.midGrid}>',
  );
  const kpiCards = kpiSectionSource.match(/<KpiCard/g) ?? [];

  assert.equal(kpiCards.length, 6);
  for (const label of [
    'label="EVENTS"',
    'label="AT RISK"',
    'label="BUDGET"',
    'label="APPROVALS"',
    'label="DEADLINES"',
    'label="OVERDUE"',
  ]) {
    assert.equal(kpiSectionSource.includes(label), true, label);
  }
  assert.equal(kpiSectionSource.includes('label="TASKS"'), false);
  assert.equal(kpiSectionSource.includes('label="SPEAKERS"'), false);
  assert.equal(kpiSectionSource.includes("overdueActionableCount"), true);
  assert.match(
    kpiSectionSource,
    /label="OVERDUE"[\s\S]*value=\{overdueActionableCount\.toString\(\)\}[\s\S]*href=\{deadlinesHref\}/,
  );
});

test("Portfolio Timeline explains its dynamic event prioritization accessibly", () => {
  const timelineSource = sourceBetween(
    dashboardSource,
    'title="Portfolio Timeline"',
    '<DashboardPanel title="Upcoming Deadlines">',
  );

  assert.match(
    timelineSource,
    /\{visiblePortfolioEvents\.length\} of \{rankedPortfolioEvents\.length\}/,
  );
  assert.doesNotMatch(dashboardSource, /rankedRoadmapEvents/);
  assert.doesNotMatch(dashboardSource, /previewRoadmapEvents/);
  assert.doesNotMatch(dashboardSource, /remainingRoadmapEvents/);
  assert.doesNotMatch(dashboardSource, /renderMoreTimeline/);
  assert.match(timelineSource, /events/);
  assert.doesNotMatch(timelineSource, /shown/);
  assert.match(timelineSource, /<button\s+type="button"/);
  assert.match(timelineSource, /aria-label="How portfolio events are prioritized"/);
  assert.match(timelineSource, /aria-describedby="portfolio-timeline-prioritization"/);
  assert.match(timelineSource, /Prioritized by event status, risks, approvals, and budget signals\./);
  assert.match(dashboardStylesSource, /\.timelinePriorityTrigger:focus-visible/);
  assert.match(dashboardStylesSource, /\.timelinePriorityHelp:focus-within \.timelinePriorityTooltip/);
});

test("Portfolio Timeline preserves ranking, expansion, links, and index-based colors", () => {
  const rankingSource = sourceBetween(
    dashboardSource,
    "const rankedPortfolioEvents = events",
    "const visiblePortfolioEvents = rankedPortfolioEvents.slice(0, 5);",
  );
  const rendererSource = sourceBetween(
    dashboardSource,
    "const renderTimelineContent =",
    "const renderRemainingPortfolioEvents =",
  );

  assert.match(rankingSource, /left\.activeRecentRank - right\.activeRecentRank/);
  assert.match(rankingSource, /Number\(right\.healthSignalCount > 0\)/);
  assert.match(rankingSource, /right\.healthSignalCount - left\.healthSignalCount/);
  assert.match(rankingSource, /left\.upcomingFallback - right\.upcomingFallback/);
  assert.match(rankingSource, /left\.event\.name\.localeCompare\(right\.event\.name\)/);
  assert.match(dashboardSource, /visiblePortfolioEvents = rankedPortfolioEvents\.slice\(0, 5\)/);
  assert.match(dashboardSource, /remainingPortfolioEvents = rankedPortfolioEvents\.slice\(5\)/);
  assert.match(dashboardSource, /if \(remainingPortfolioEvents\.length === 0\) return null/);
  assert.equal(
    rendererSource.match(
      /TIMELINE_COLORS\[\(index \+ offset\) % TIMELINE_COLORS\.length\]/g,
    )?.length,
    2,
  );
  assert.equal(
    rendererSource.match(/href=\{`\/events\/\$\{event\.id\}\/timeline`\}/g)?.length,
    2,
  );
  assert.match(
    dashboardSource,
    /renderTimelineContent\(\s*remainingPortfolioEvents,\s*visiblePortfolioEvents\.length/,
  );
});

test("Command Center responds to dashboard content width before cards or panels become cramped", () => {
  assert.match(
    dashboardStylesSource,
    /@container account-dashboard \(max-width: 1040px\) \{[\s\S]*\.kpiGrid \{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    dashboardStylesSource,
    /@container account-dashboard \(max-width: 980px\) \{[\s\S]*\.dashboardActions \{[\s\S]*width: 100%[\s\S]*\.midGrid,[\s\S]*\.lowerGrid,[\s\S]*\.financialOverviewGrid \{[\s\S]*grid-template-columns: 1fr/,
  );
  assert.match(
    dashboardStylesSource,
    /@container account-dashboard \(max-width: 780px\) \{[\s\S]*\.kpiGrid \{[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    dashboardStylesSource,
    /@container account-dashboard \(max-width: 620px\) \{[\s\S]*\.dashboardActions \{[\s\S]*grid-template-columns: 1fr[\s\S]*\.kpiGrid \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    dashboardStylesSource,
    /@container account-dashboard \(max-width: 400px\) \{[\s\S]*\.kpiGrid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(dashboardStylesSource, /\.dashboardHeader \{[\s\S]*flex-wrap: wrap/);
  assert.match(dashboardStylesSource, /\.eventLauncher \{[\s\S]*grid-column: 1 \/ -1/);
  assert.doesNotMatch(dashboardStylesSource, /@media \(max-width: (1180|920|760|620)px\)/);
});

test("Command Center data loading avoids duplicated nested budget payloads", () => {
  const eventQuerySource = sourceBetween(
    dashboardServiceSource,
    "prisma.event.findMany({",
    "prisma.budgetLineItem.findMany({",
  );

  assert.equal(eventQuerySource.includes("\n            lineItems:"), false);
  assert.equal(eventQuerySource.includes("submissions:"), false);
  // C1: deadline/timeline risk rows are no longer nested under every event. The
  // event select is lean; the dashboard reads bounded top-12 lists + grouped
  // per-event risk counts as separate queries.
  assert.equal(eventQuerySource.includes("deadlines: {"), false);
  assert.equal(eventQuerySource.includes("timelineItems: {"), false);
  assert.equal(dashboardServiceSource.includes("prisma.deadline.findMany"), true);
  assert.equal(dashboardServiceSource.includes('by: ["eventId"]'), true);
  assert.equal(dashboardServiceSource.includes("prisma.budgetSubmission.groupBy"), true);
  assert.equal(dashboardServiceSource.includes("budgetId: true"), true);
  assert.equal(dashboardServiceSource.includes("lineItem: true"), false);
  assert.equal(dashboardSource.includes("getCommandCenterDashboardData"), true);
  assert.equal(dashboardSource.includes("budgetTotalsByBudgetId"), true);
});

test("Portfolio Timeline fetches only the integration fields used for prioritization", () => {
  const integrationMetricSelect = sourceBetween(
    dashboardServiceSource,
    "integrationMetrics: {",
    "budget: {",
  );

  assert.match(integrationMetricSelect, /currentValue: true/);
  assert.match(integrationMetricSelect, /goalValue: true/);
  assert.match(integrationMetricSelect, /pacePercent: true/);
  assert.doesNotMatch(integrationMetricSelect, /type: true/);
  assert.doesNotMatch(integrationMetricSelect, /delta7dPercent: true/);
  assert.doesNotMatch(integrationMetricSelect, /updatedAt: true/);
  assert.match(integrationMetricSelect, /orderBy: \{ type: "asc" \}/);
});

test("Account dashboard budget rollups use DB aggregates, not unbounded JS sums", () => {
  // Org/per-event/category totals come from groupBy/_sum; only the row-level
  // "actual > forecast" comparison keeps a line-item read, and that read is
  // bounded to spent items (actualCents > 0).
  assert.equal(dashboardServiceSource.includes('by: ["budgetId"]'), true);
  assert.equal(dashboardServiceSource.includes('by: ["category", "approval"]'), true);
  assert.equal(dashboardServiceSource.includes("_sum: { forecastCents: true, actualCents: true }"), true);
  assert.equal(dashboardServiceSource.includes("actualCents: { gt: 0 }"), true);
  // The unbounded full-line-item findMany (select of forecast/actual/approval for
  // every row) is gone; the page no longer sums raw line items in JS.
  assert.equal(dashboardServiceSource.includes("approval: true"), false);
  assert.equal(dashboardSource.includes("budgetLineItems.reduce"), false);
  assert.equal(dashboardSource.includes("actionableBudgetLineItems"), false);
  // Page consumes the pre-aggregated fields.
  assert.equal(dashboardSource.includes("budgetTotals.forecastCents"), true);
  assert.equal(dashboardSource.includes("budgetCategoryBreakdown"), true);
  assert.equal(dashboardSource.includes("budgetOverForecastOrgCount"), true);
});

test("Account Command Center deadlines source from TimelineItem, not only Deadline rows", () => {
  // Deadline rows are not created in production, so the dashboard must merge
  // deadline-like data from TimelineItem.endDate. Both sources are now bounded
  // top-12 reads (C1): real Deadline rows via prisma.deadline.findMany, timeline
  // deadlines via the take:50 timelineItem query, then merged + de-duped.
  assert.equal(dashboardServiceSource.includes("prisma.deadline.findMany"), true);
  assert.equal(dashboardServiceSource.includes("prisma.timelineItem.findMany"), true);
  assert.equal(dashboardServiceSource.includes("endDate: { lte: input.nearFuture }"), true);
  assert.equal(dashboardServiceSource.includes("status: { not: TimelineStatus.COMPLETE }"), true);
  // Deadline rows are still sourced (union), and both sources are de-duped.
  assert.equal(dashboardServiceSource.includes("const deadlineRows"), true);
  assert.equal(dashboardServiceSource.includes("const timelineDeadlines"), true);
  assert.equal(dashboardServiceSource.includes("deadlineDedupeKey"), true);
  // Bounded read so large orgs do not stream every timeline row.
  assert.equal(dashboardServiceSource.includes("take: 50"), true);
});

test("C1 aggregate/list queries preserve org/event scoping", () => {
  assert.equal(dashboardServiceSource.includes('import { resolveActiveEventVisibilityWhere } from "@/lib/events"'), true);
  assert.equal(dashboardServiceSource.includes("resolveActiveEventVisibilityWhere({"), true);
  // Every new per-event count-where builder starts from the shared eventAccessWhere
  // so bounding never widens visibility beyond the org/membership scope.
  for (const builder of [
    "riskyDeadlineCountWhere",
    "riskyTimelineCountWhere",
    "overdueTimelineCountWhere",
    "atRiskTimelineCountWhere",
  ]) {
    const idx = dashboardServiceSource.indexOf(`const ${builder} = {`);
    assert.notEqual(idx, -1, `${builder} should exist`);
    const block = dashboardServiceSource.slice(idx, idx + 200);
    assert.match(block, /event: eventAccessWhere/, `${builder} is org/event scoped`);
  }
  // The two bounded top-12 list queries are scoped too.
  assert.equal(dashboardServiceSource.includes("where: { event: eventAccessWhere, ...deadlineWhere }"), true);
  assert.equal(dashboardServiceSource.includes("where: { event: eventAccessWhere, ...timelineRiskWhere }"), true);
});

test("Action Center Deadlines view merges TimelineItem deadlines", () => {
  const actionCenterSource = readFileSync(
    "app/(shell)/dashboard/action-center/page.tsx",
    "utf8",
  );
  assert.equal(actionCenterSource.includes('import { resolveActiveEventVisibilityWhere } from "@/lib/events"'), true);
  assert.equal(actionCenterSource.includes("resolveActiveEventVisibilityWhere({"), true);
  // Timeline-derived deadlines are surfaced in the Deadlines view, deduped
  // against Deadline rows, and not double-counted into the Risks view.
  assert.equal(actionCenterSource.includes("deadlineTimelineItems"), true);
  assert.equal(actionCenterSource.includes("timelineDeadlineItems"), true);
  assert.equal(actionCenterSource.includes("deadlines: [...deadlineItems, ...timelineDeadlineItems]"), true);
  assert.equal(actionCenterSource.includes("risks: riskItems"), true);
});

test("Account approvals include documents in review across KPI and drill-down", () => {
  const actionCenterSource = readFileSync(
    "app/(shell)/dashboard/action-center/page.tsx",
    "utf8",
  );
  // Service surfaces the portfolio docs-in-review count; the page KPI adds it.
  assert.equal(dashboardServiceSource.includes("documentsInReviewCount"), true);
  assert.equal(dashboardServiceSource.includes("status: DocumentStatus.IN_REVIEW"), true);
  assert.equal(dashboardSource.includes("documentsInReviewCount"), true);
  // The Action Center approvals drill-down includes document reviews so its list
  // matches the KPI count.
  assert.equal(actionCenterSource.includes("documentReviewApprovals"), true);
  assert.equal(
    actionCenterSource.includes("...pendingLineItemApprovals, ...submittedApprovals, ...documentReviewApprovals"),
    true,
  );
});
