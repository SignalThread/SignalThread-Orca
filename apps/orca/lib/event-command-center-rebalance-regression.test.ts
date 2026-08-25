import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registrySource = readFileSync("app/(shell)/events/[eventId]/_components/event-command-center-widget-registry.ts", "utf8");
const rendererSource = readFileSync("app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx", "utf8");
const serviceSource = readFileSync("src/server/services/event-command-center.ts", "utf8");
const gridSource = readFileSync("app/(shell)/events/[eventId]/_components/event-command-center-grid-layout.ts", "utf8");

test("default Event Command Center is rebalanced around five distinct planner questions", () => {
  for (const id of ["readiness-dashboard", "planner-focus", "conflicts-details", "event-budget-overview", "run-of-show-readiness"]) {
    assert.match(registrySource, new RegExp(`id: "${id}"[\\s\\S]*defaultPhases: ALL_PHASES`));
  }
  assert.match(registrySource, /id: "roadmap-progress"[\s\S]*defaultPhases: \[\]/);
  assert.match(registrySource, /id: "upcoming-deadlines"[\s\S]*defaultPhases: \[\]/);
});

test("new widget ids have explicit sizing contracts and do not reuse roadmap progress", () => {
  assert.match(gridSource, /"planner-focus": \{ family: "largeList", defaultW: 4/);
  assert.match(gridSource, /"run-of-show-readiness": \{ family: "largeList", defaultW: 6/);
  assert.match(gridSource, /"readiness-dashboard": \{ family: "compact", defaultW: 4[\s\S]*defaultH: 5, minH: 3/);
  assert.doesNotMatch(gridSource, /"roadmap-progress": \{ family: "largeList", defaultW: 6[\s\S]*Run of Show Readiness/);
});

test("Planner Focus is deterministic, deduped, linked, and never AI-generated", () => {
  assert.match(serviceSource, /const plannerFocusCandidates/);
  assert.match(serviceSource, /focusRank\(item\)/);
  assert.match(serviceSource, /focusDedupeKey\(item\.id\)/);
  assert.match(serviceSource, /notificationItemHref/);
  assert.match(serviceSource, /plannerFocusSourceLabel/);
  assert.match(serviceSource, /source: "Speakers"/);
  assert.match(serviceSource, /href: speakersHref/);
  assert.match(serviceSource, /item\.id\.startsWith\("registration-"\)[\s\S]*registrationHref/);
  assert.match(serviceSource, /item\.id\.startsWith\("housing-"\)[\s\S]*housingHref/);
  assert.match(rendererSource, /function PlannerFocusWidget/);
  assert.match(rendererSource, /No immediate action required\./);
  assert.doesNotMatch(serviceSource, /openai|chatCompletion|generateText/i);
});

test("Run of Show Readiness uses explicit supported counts and honest empty states", () => {
  for (const metric of ["Valid times", "Rooms assigned", "Speakers assigned", "AV assigned", "F&B assigned", "Staffing assigned"]) {
    assert.match(serviceSource, new RegExp(metric.replace("&", "&")));
  }
  assert.match(serviceSource, /sessionsWithValidTimesCount/);
  assert.match(serviceSource, /missingRoomCount/);
  assert.match(serviceSource, /fnbPendingSessionCount/);
  assert.match(rendererSource, /function RunOfShowReadinessWidget/);
  assert.match(rendererSource, /No Run of Show items have been added yet\./);
  assert.match(rendererSource, /label="Open Run of Show"/);
  assert.match(rendererSource, /metric\.ready \/ metric\.total/);
  assert.doesNotMatch(rendererSource, /Run of Show Readiness[\s\S]*DonutChart/);
});

test("Planner Focus owns action items while Run of Show Readiness is a scorecard", () => {
  const plannerFocusSource = rendererSource.slice(
    rendererSource.indexOf("function PlannerFocusWidget"),
    rendererSource.indexOf("function RoadmapProgressWidget"),
  );
  const runOfShowSource = rendererSource.slice(
    rendererSource.indexOf("function RunOfShowReadinessWidget"),
    rendererSource.indexOf("function SessionReadinessWidget"),
  );

  assert.match(plannerFocusSource, /item\.source/);
  assert.match(plannerFocusSource, /item\.reason/);
  assert.match(runOfShowSource, /ReadinessRows rows=\{metrics\}/);
  assert.match(runOfShowSource, /Times Complete/);
  assert.doesNotMatch(runOfShowSource, /readiness\.gaps|compactTableList|Sessions need/);
});

test("Open Conflicts keeps source labels and real links", () => {
  assert.match(rendererSource, /<WidgetPanel title="Open Conflicts"/);
  assert.match(serviceSource, /source: notificationSourceLabel\(item\.type\)/);
  assert.match(serviceSource, /source: "Run of Show"/);
  assert.match(serviceSource, /href: gap\.href/);
  assert.match(serviceSource, /deadlinesPayload\s*\n\s*\.filter\(\(item\) => item\.status === "overdue"\)/);
  assert.match(rendererSource, /item\.source \? `\$\{item\.source\} · ` : ""/);
  assert.match(rendererSource, /const actionQueue = data\.event\.conflicts\.slice\(0, 5\)/);
});

test("Operational readiness navigation uses event-specific destinations", () => {
  assert.match(serviceSource, /const registrationHref = eventAttendeesHref\(event\.id\)/);
  assert.match(serviceSource, /const housingHref = eventSettingsHref\(event\.id\)/);
  assert.match(serviceSource, /href: registrationHref/);
  assert.match(serviceSource, /href: housingHref/);
});

test("Operational readiness renders a derived compact summary instead of a sparse table", () => {
  const readinessWidgetSource = rendererSource.slice(
    rendererSource.indexOf("function ReadinessDashboardWidget"),
    rendererSource.indexOf("function RunOfShowReadinessWidget"),
  );
  assert.match(rendererSource, /const statusCounts = readinessRows\.reduce/);
  assert.match(rendererSource, /statusCounts\.critical > 0 \? "critical"/);
  assert.match(rendererSource, /\`\$\{statusCounts\.stable\} of \$\{totalAreas\} areas on track\`/);
  assert.match(rendererSource, /operationalReadinessCounts/);
  assert.match(rendererSource, /operationalReadinessTrack/);
  assert.match(rendererSource, /className=\{styles\.operationalReadinessRow\}/);
  assert.doesNotMatch(readinessWidgetSource, /statusDot|compactTableRow/);
});
