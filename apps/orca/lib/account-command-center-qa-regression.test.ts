import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  accountActionCenterHref,
  accountEventsHref,
  accountFinancialsHref,
  roadmapItemHref,
} from "@/lib/event-command-center-links";

const dashboardSource = readFileSync("app/(shell)/dashboard/page.tsx", "utf8");
const actionCenterSource = readFileSync("app/(shell)/dashboard/action-center/page.tsx", "utf8");
const queueSource = readFileSync("app/(shell)/dashboard/action-center/ActionCenterQueue.tsx", "utf8");
const financialsSource = readFileSync("app/(shell)/dashboard/financials/page.tsx", "utf8");
const dashboardServiceSource = readFileSync("src/server/services/command-center-dashboard.ts", "utf8");
const shellScaffoldSource = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");
const dashboardStylesSource = readFileSync("app/(shell)/dashboard/dashboard.module.css", "utf8");

const EVENT_ID = "717ca942-5701-4bfb-82e7-afddf41f19a7";
const ITEM_ID = "11111111-1111-4111-8111-111111111111";

test("account dashboard route helpers build scoped drill-down URLs", () => {
  assert.equal(accountEventsHref(), "/dashboard#event-snapshot");
  assert.equal(accountActionCenterHref({ view: "deadlines" }), "/dashboard/action-center?view=deadlines");
  assert.equal(accountActionCenterHref({ view: "deadlines", filter: "overdue" }), "/dashboard/action-center?view=deadlines&filter=overdue");
  assert.equal(accountFinancialsHref(), "/dashboard/financials");
  assert.equal(accountFinancialsHref({ view: "events" }), "/dashboard/financials?view=events");
  assert.equal(accountFinancialsHref({ view: "categories", category: "F&B" }), "/dashboard/financials?view=categories&category=F%26B");
  assert.equal(roadmapItemHref({ eventId: EVENT_ID, itemId: ITEM_ID }), `/events/${EVENT_ID}/timeline?view=TIMELINE&item=${ITEM_ID}`);
});

test("Events KPI is clickable and points to the account events list", () => {
  assert.match(dashboardSource, /const eventsHref = accountEventsHref\(\)/);
  assert.match(dashboardSource, /label="EVENTS"[\s\S]*href=\{eventsHref\}[\s\S]*title=\{`View all \$\{events\.length\} events`\}/);
  assert.match(dashboardSource, /id="event-snapshot"/);
});

test("Account Command Center owns the full shell width without a concierge column", () => {
  assert.ok(
    shellScaffoldSource.includes(
      "const isAccountCommandCenterRoute = /^\\/dashboard(?:\\/|$)/.test(pathname);",
    ),
  );
  assert.match(shellScaffoldSource, /usesFullContentWidth[\s\S]*isAccountCommandCenterRoute/);
  assert.match(shellScaffoldSource, /usesFullContentWidth \? "w-full" : "w-full max-w-\[1100px\]"/);
  assert.match(dashboardStylesSource, /\.dashboardPage\s*\{[\s\S]*?width: 100%;[\s\S]*?max-width: none;/);
  assert.match(dashboardStylesSource, /\.dashboardShell\s*\{[\s\S]*?width: 100%;[\s\S]*?max-width: none;/);
  assert.doesNotMatch(dashboardStylesSource, /grid-template-columns:\s*[^;]*concierge/i);
});

test("Overdue and Deadlines links use distinct Action Center URLs", () => {
  assert.match(dashboardSource, /const deadlinesHref = accountActionCenterHref\(\{ view: "deadlines" \}\)/);
  assert.match(dashboardSource, /const overdueHref = accountActionCenterHref\(\{ view: "deadlines", filter: "overdue" \}\)/);
  assert.match(dashboardSource, /label="DEADLINES"[\s\S]*href=\{overdueHref\}/);
  assert.match(dashboardSource, /href=\{deadlinesHref\}[\s\S]*View all/);
});

test("Action Center owns URL-addressable overdue deadline filtering", () => {
  assert.match(actionCenterSource, /normalizeDeadlineFilter\(resolvedSearchParams\.filter\)/);
  assert.match(actionCenterSource, /deadlineFilter === "overdue"/);
  assert.match(actionCenterSource, /initialSummaryFilter=\{deadlineFilter === "overdue" \? "overdue" : "all"\}/);
  assert.match(queueSource, /summaryFilter === "overdue"/);
  assert.match(queueSource, /params\.set\("filter", "overdue"\)/);
  assert.match(queueSource, /params\.delete\("filter"\)/);
});

test("Portfolio financial links stay account-level and support category drill-downs", () => {
  assert.match(dashboardSource, /const financialsHref = accountFinancialsHref\(\)/);
  assert.match(dashboardSource, /const financialsEventsHref = accountFinancialsHref\(\{ view: "events" \}\)/);
  assert.match(dashboardSource, /href=\{financialsHref\}[\s\S]*Open budgets/);
  assert.match(dashboardSource, /href=\{accountFinancialsHref\(\{ category: categoryKey, view: "categories" \}\)\}/);
  assert.match(dashboardSource, /href=\{financialsEventsHref\}[\s\S]*View all events/);
  assert.doesNotMatch(dashboardSource, /href="\/budgets"[\s\S]*(Open budgets|View all events)/);
});

test("Financial drill-down is account scoped and category URL-addressable", () => {
  assert.match(financialsSource, /resolveActiveEventVisibilityWhere/);
  assert.match(financialsSource, /budgetLineItem\.groupBy/);
  assert.match(financialsSource, /accountFinancialsHref\(\{ view: "categories", category: row\.category \}\)/);
  assert.match(financialsSource, /eventBudgetHref\(row\.event\.id\)/);
  assert.match(financialsSource, /budgetCategoriesMatch\(row\.category, selectedCategory\)/);
});

test("Upcoming deadline rows retain timeline IDs and reuse the Roadmap deep-link builder", () => {
  assert.match(dashboardServiceSource, /id: `timeline-\$\{item\.id\}`/);
  assert.match(dashboardSource, /commandCenterRoadmapRecordHref\(deadline\.event\.id, deadline\.id\)/);
  assert.doesNotMatch(dashboardSource, /href=\{`\/events\/\$\{deadline\.event\.id\}\/timeline`\}/);
});
