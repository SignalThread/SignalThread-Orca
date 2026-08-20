import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  commandCenterRoadmapRecordHref,
  eventDeadlineHref,
  eventTimelineListHref,
  operationalReadinessHref,
  roadmapItemHref,
} from "@/lib/event-command-center-links";

const rendererSource = readFileSync("app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx", "utf8");
const commandCenterSource = readFileSync("app/(shell)/events/[eventId]/_components/event-command-center.tsx", "utf8");
const serviceSource = readFileSync("src/server/services/event-command-center.ts", "utf8");
const timelinePageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const ganttSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");

const EVENT_ID = "717ca942-5701-4bfb-82e7-afddf41f19a7";
const ITEM_A = "11111111-1111-4111-8111-111111111111";
const ITEM_B = "22222222-2222-4222-8222-222222222222";
const DEADLINE_ID = "33333333-3333-4333-8333-333333333333";

test("Event Command Center header contains only event identity and date range", () => {
  const headerStart = commandCenterSource.indexOf("<header className={styles.commandHeader}");
  const headerSource = commandCenterSource.slice(headerStart, commandCenterSource.indexOf("</header>", headerStart));

  assert.match(headerSource, /data\.event\.name/);
  assert.match(headerSource, /eventDateRange/);
  assert.doesNotMatch(headerSource, /commandEyebrow|headerMeta|phaseChip|headerVerdict|verdictBadge|generatedAt|daysLabel|data\.event\.venue/);
});

test("command center roadmap deep links are stable record-specific URLs", () => {
  const first = roadmapItemHref({ eventId: EVENT_ID, itemId: ITEM_A });
  const second = roadmapItemHref({ eventId: EVENT_ID, itemId: ITEM_B });

  assert.equal(first, `/events/${EVENT_ID}/timeline?view=TIMELINE&item=${ITEM_A}`);
  assert.equal(second, `/events/${EVENT_ID}/timeline?view=TIMELINE&item=${ITEM_B}`);
  assert.notEqual(first, second);
  assert.equal(commandCenterRoadmapRecordHref(EVENT_ID, `timeline-${ITEM_A}`), first);
  assert.equal(commandCenterRoadmapRecordHref(EVENT_ID, `risk-${ITEM_A}`), first);
  assert.equal(commandCenterRoadmapRecordHref(EVENT_ID, `deadline-${DEADLINE_ID}`), eventDeadlineHref(EVENT_ID, DEADLINE_ID));
});

test("aggregate command center links use intentional destinations", () => {
  assert.equal(eventTimelineListHref(EVENT_ID), `/events/${EVENT_ID}/timeline?view=LIST`);
  assert.equal(eventTimelineListHref(EVENT_ID, { conflict: true }), `/events/${EVENT_ID}/timeline?view=LIST&filter=conflicts`);
  assert.equal(operationalReadinessHref(EVENT_ID, "speakers"), `/events/${EVENT_ID}/speakers`);
  assert.equal(operationalReadinessHref(EVENT_ID, "avProduction"), `/events/${EVENT_ID}/matrix`);
  // F&B readiness lands in the event-level F&B Planner under Run of Show; Menus is not a
  // standalone destination.
  assert.equal(operationalReadinessHref(EVENT_ID, "fnb"), `/events/${EVENT_ID}/matrix/fnb`);
  assert.equal(operationalReadinessHref(EVENT_ID, "staffing"), `/events/${EVENT_ID}/staffing`);
  assert.equal(operationalReadinessHref(EVENT_ID, "rooms"), `/events/${EVENT_ID}/matrix`);
});

test("event command center widgets no longer point rows at the generic timeline dashboard", () => {
  assert.match(rendererSource, /href=\{commandCenterRoadmapRecordHref\(data\.event\.id, deadline\.id\)\}/);
  assert.match(rendererSource, /href=\{commandCenterRoadmapRecordHref\(data\.event\.id, item\.id\)\}/);
  assert.match(rendererSource, /<WidgetPanel title="Upcoming Critical Dates"[\s\S]*eventTimelineListHref\(data\.event\.id\)[\s\S]*label="View all"/);
  assert.match(rendererSource, /label="View All Conflicts"/);
  assert.match(rendererSource, /href=\{eventTimelineListHref\(data\.event\.id, \{ conflict: true \}\)\}/);
  assert.doesNotMatch(rendererSource, /<WidgetPanel title="Readiness Dashboard"[\s\S]*href=\{data\.links\.timeline\} label="View all"/);
});

test("conflict rows dedupe only by stable record id and keep same-title distinct records", () => {
  assert.match(serviceSource, /new Map<string, ConflictItem>/);
  assert.match(serviceSource, /if \(!acc\.has\(item\.id\)\) acc\.set\(item\.id, item\)/);
  assert.doesNotMatch(serviceSource, /acc\.has\(item\.title\)/);
  assert.match(rendererSource, /<li key=\{item\.id\}>/);
  assert.match(rendererSource, /aria-label=\{`\$\{item\.title\}\. \$\{item\.detail\}\. \$\{item\.dueLabel\}`\}/);
});

test("operational readiness uses broad event categories instead of run-of-show assignment rows", () => {
  assert.match(rendererSource, /<WidgetPanel title="Operational Readiness"/);
  assert.match(serviceSource, /operationalReadiness: OperationalReadinessCategory\[\]/);
  for (const category of ["Registration", "Housing", "Budget", "Documents / Approvals", "Speaker Deliverables"]) {
    assert.match(serviceSource, new RegExp(category.replace(" / ", " \\/ ")));
  }
  assert.doesNotMatch(rendererSource, /operationalReadinessHref/);
  assert.doesNotMatch(rendererSource, new RegExp('label: "AV / Production"'));
  assert.doesNotMatch(rendererSource, /label: "F&B"/);
  assert.doesNotMatch(rendererSource, /label: "Staffing"/);
  assert.doesNotMatch(rendererSource, /label: "Rooms"/);
});

test("Rooms readiness counts only sessions with a valid event-scoped room relation", () => {
  assert.match(serviceSource, /where: \{ eventId, roomId: \{ not: null \}, room: \{ is: \{ eventId \} \} \}/);
  assert.doesNotMatch(serviceSource, /where: \{ eventId, OR: \[\{ roomId: \{ not: null \} \}, \{ roomName: \{ not: null \} \}\] \}/);
});

test("command center approval and room metrics use the same session/detail sources", () => {
  assert.match(serviceSource, /approvals: approvalsPayload\.length/);
  assert.match(serviceSource, /roomStatus: \{ set: sessionsWithRoomCount/);
  assert.match(rendererSource, /Documents and budget approvals/);
});

test("missing optional command-center sources become an honest unavailable state", () => {
  assert.match(serviceSource, /isMissingOptionalDataSource\(error\)/);
  assert.match(serviceSource, /unavailableSources\.add\(source\)/);
  assert.match(serviceSource, /dataQuality: \{ unavailableSources: Array\.from\(unavailableSources\)/);
  assert.match(commandCenterSource, /data\.dataQuality\.unavailableSources\.length/);
  assert.match(commandCenterSource, /affected summaries may be incomplete/);
});

test("Roadmap item deep links survive direct load and fail gracefully when unknown", () => {
  assert.match(timelinePageSource, /const requestedTimelineItemId = searchParams\.get\("item"\)/);
  assert.match(timelinePageSource, /setViewMode\("TIMELINE"\)/);
  assert.match(timelinePageSource, /setSelectedTimelineItemId\(item\.id\)/);
  assert.match(timelinePageSource, /That roadmap item link is no longer available\./);
  assert.match(timelinePageSource, /router\.push\(`\?\$\{params\.toString\(\)\}`\)/);
  assert.match(ganttSource, /if \(!selectedItemId \|\| quickEditItemId === selectedItemId\) return/);
  assert.match(ganttSource, /openQuickEdit\(item\)/);
});
