import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTimelineDashboard,
  type DashboardDependencyInput,
  type DashboardItemInput,
} from "@/src/server/services/timeline-dashboard";

function d(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function item(partial: Partial<DashboardItemInput> & { id: string; title: string }): DashboardItemInput {
  return {
    department: null,
    workstream: null,
    planningStage: null,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    isCriticalPath: false,
    startDate: null,
    endDate: null,
    parentId: null,
    ownerUser: null,
    ...partial,
  };
}

const NOW = d("2026-06-17");
const EVENT = { id: "evt-1", name: "Summit 2026", startDate: d("2026-01-01"), endDate: d("2026-08-01") };

function buildScenario(overrides?: { selectedWorkstream?: string | null }) {
  const items: DashboardItemInput[] = [
    item({ id: "root", title: "Event Timeline" }),
    item({ id: "A1", title: "Confirm venue", workstream: "VENUE", planningStage: "PLANNING", status: "COMPLETE", endDate: d("2026-05-01") }),
    item({ id: "A2", title: "Venue layout", workstream: "VENUE", planningStage: "PLANNING", status: "IN_PROGRESS", endDate: d("2026-07-01") }),
    item({ id: "A3", title: "Loading dock plan", workstream: "VENUE", planningStage: "BUILD", status: "AT_RISK", endDate: d("2026-06-10") }),
    item({ id: "B1", title: "Catering final count", workstream: "FNB", planningStage: "SHOW_WEEK", status: "NOT_STARTED", isCriticalPath: true, priority: "CRITICAL", endDate: d("2026-06-20") }),
    item({ id: "C1", title: "Room blocks", department: "Rooms", planningStage: "PLANNING", status: "IN_PROGRESS", endDate: d("2026-08-01"), ownerUser: { id: "u1", name: "Dana", email: "dana@x.com" } }),
    item({ id: "D1", title: "Launch site", workstream: "MARKETING", status: "COMPLETE", endDate: d("2026-03-01") }),
  ];
  const dependencies: DashboardDependencyInput[] = [{ predecessorItemId: "A2", successorItemId: "B1" }];
  return buildTimelineDashboard({ event: EVENT, items, dependencies, now: NOW, selectedWorkstream: overrides?.selectedWorkstream ?? null });
}

test("root Event Timeline item is excluded from all rollups", () => {
  const dash = buildScenario();
  assert.equal(dash.totals.totalItems, 6); // 7 inputs minus the root container
  assert.equal(dash.workstreams.find((w) => w.workstream === "VENUE")?.totalItems, 4);
});

test("legacy department maps into the canonical workstream bucket", () => {
  const dash = buildScenario();
  const venue = dash.workstreams.find((w) => w.workstream === "VENUE");
  // C1 has department "Rooms" (no workstream column) and should land in VENUE
  assert.ok(venue);
  assert.equal(venue?.totalItems, 4); // A1, A2, A3, C1
  assert.equal(dash.totals.unassignedWorkstreamItems, 0);
});

test("workstream rollups compute completion, open, and blocker counts", () => {
  const dash = buildScenario();
  const venue = dash.workstreams.find((w) => w.workstream === "VENUE");
  assert.equal(venue?.completeItems, 1);
  assert.equal(venue?.percentComplete, 25);
  assert.equal(venue?.openItems, 3);
  assert.equal(venue?.blockerItems, 1); // A3
  const fnb = dash.workstreams.find((w) => w.workstream === "FNB");
  assert.equal(fnb?.totalItems, 1);
  assert.equal(fnb?.blockerItems, 1); // B1
});

test("dashboard summaries omit canonical workstreams with zero items", () => {
  const dash = buildScenario();
  const keys = dash.workstreams.map((w) => w.workstream);
  assert.deepEqual(keys, ["VENUE", "FNB", "MARKETING"]);
  assert.equal(keys.includes("UNASSIGNED" as never), false);
});

test("assigning an item to an empty workstream adds it to dashboard summaries", () => {
  const withoutHousing = buildTimelineDashboard({
    event: EVENT,
    now: NOW,
    dependencies: [],
    items: [item({ id: "A1", title: "Venue contract", workstream: "VENUE" })],
  });
  const withHousing = buildTimelineDashboard({
    event: EVENT,
    now: NOW,
    dependencies: [],
    items: [
      item({ id: "A1", title: "Venue contract", workstream: "VENUE" }),
      item({ id: "A2", title: "Room block", workstream: "HOUSING" }),
    ],
  });

  assert.equal(withoutHousing.workstreams.some((workstream) => workstream.workstream === "HOUSING"), false);
  assert.equal(withHousing.workstreams.some((workstream) => workstream.workstream === "HOUSING"), true);
});

test("custom department-backed workstreams render dashboard cards and can be selected", () => {
  const dash = buildTimelineDashboard({
    event: EVENT,
    now: NOW,
    dependencies: [],
    selectedWorkstream: "VIP Services",
    items: [
      item({ id: "A1", title: "VIP arrivals", department: " VIP   Services ", status: "COMPLETE" }),
      item({ id: "A2", title: "VIP credentials", department: "vip services", status: "NOT_STARTED" }),
    ],
  });

  const custom = dash.workstreams.find((w) => w.workstream === "VIP Services");
  assert.ok(custom);
  assert.equal(custom?.label, "VIP Services");
  assert.equal(custom?.totalItems, 2);
  assert.equal(custom?.percentComplete, 50);
  assert.equal(dash.workstreams.length, 1);
  assert.equal(dash.selectedWorkstream?.workstream, "VIP Services");
});

test("unassigned items count toward overall progress without rendering a workstream card", () => {
  const dash = buildTimelineDashboard({
    event: EVENT,
    now: NOW,
    dependencies: [],
    items: [
      item({ id: "A1", title: "Imported row without workstream", status: "COMPLETE" }),
      item({ id: "A2", title: "Imported open row without workstream", status: "NOT_STARTED" }),
      item({ id: "B1", title: "Named marketing row", workstream: "MARKETING", status: "NOT_STARTED" }),
    ],
  });

  assert.equal(dash.totals.totalItems, 3);
  assert.equal(dash.totals.completeItems, 1);
  assert.equal(dash.totals.percentComplete, 33);
  assert.equal(dash.totals.unassignedWorkstreamItems, 2);
  assert.equal(dash.workstreams.length, 1);
  assert.equal(dash.workstreams.some((w) => w.workstream === "UNASSIGNED"), false);
  assert.notEqual(dash.selectedWorkstream?.workstream, "UNASSIGNED");
});

test("stage rollups reflect completion and status", () => {
  const dash = buildScenario();
  const byStage = Object.fromEntries(dash.stages.map((s) => [s.stage, s]));
  assert.equal(byStage.PLANNING.totalItems, 3); // A1, A2, C1
  assert.equal(byStage.PLANNING.completeItems, 1);
  assert.equal(byStage.PLANNING.percentComplete, 33);
  assert.equal(byStage.BUILD.status, "AT_RISK"); // A3 at risk + overdue
  assert.equal(byStage.PRE_PLANNING.totalItems, 0);
  assert.equal(byStage.PRE_PLANNING.status, "UPCOMING");
  assert.equal(byStage.CLOSE.status, "UPCOMING");
});

test("blockers include overdue, at-risk, and dependency-blocked items", () => {
  const dash = buildScenario();
  const ids = dash.blockers.map((b) => b.id).sort();
  assert.deepEqual(ids, ["A3", "B1"]);
  assert.equal(dash.totals.blockerCount, 2);
  const b1 = dash.blockers.find((b) => b.id === "B1");
  assert.equal(b1?.severity, "HIGH"); // critical path / critical priority
  assert.equal(b1?.kind, "BLOCKER");
  assert.equal(b1?.relatedItemId, "A2");
  assert.match(b1?.explanation ?? "", /prerequisite “Venue layout”/);
});

test("approaching deadlines and an approaching event produce explainable, deduplicated at-risk alerts", () => {
  const dash = buildTimelineDashboard({
    event: { id: "evt-2", name: "Near event", startDate: d("2026-06-25"), endDate: d("2026-06-26") },
    items: [
      item({ id: "soon", title: "Due soon", endDate: d("2026-06-20") }),
      item({ id: "undated", title: "Undated required work" }),
      item({ id: "done", title: "Already done", status: "COMPLETE" }),
    ],
    dependencies: [],
    now: NOW,
  });
  assert.deepEqual(dash.blockers.map((alert) => alert.id).sort(), ["soon", "undated"]);
  assert.equal(dash.blockers.find((alert) => alert.id === "soon")?.reason, "APPROACHING_DEADLINE");
  assert.equal(dash.blockers.find((alert) => alert.id === "undated")?.reason, "EVENT_APPROACHING");
  assert.ok(dash.blockers.every((alert) => alert.kind === "AT_RISK" && alert.explanation.length > 0));
});

test("a resolved prerequisite removes the blocker on its successor", () => {
  const dash = buildTimelineDashboard({
    event: EVENT,
    items: [
      item({ id: "pre", title: "Approval", status: "COMPLETE" }),
      item({ id: "next", title: "Publish", endDate: d("2026-09-01") }),
    ],
    dependencies: [{ predecessorItemId: "pre", successorItemId: "next" }],
    now: NOW,
  });
  assert.equal(dash.blockers.some((alert) => alert.id === "next"), false);
});

test("upcoming dates exclude completed and past-due items and are sorted ascending", () => {
  const dash = buildScenario();
  const ids = dash.upcomingDates.map((u) => u.id);
  // A3 is overdue (excluded), A1/D1 complete (excluded). Order by due date: B1 6/20, A2 7/1, C1 8/1
  assert.deepEqual(ids, ["B1", "A2", "C1"]);
});

test("health score is explainable and deterministic", () => {
  const dash = buildScenario();
  // 100 - overdue(8) - atRisk(6) - depBlocked(5) - criticalIncomplete(4) + bonus(0) = 77
  assert.equal(dash.health.score, 77);
  assert.equal(dash.health.label, "Good");
  const labels = dash.health.drivers.map((x) => x.label);
  assert.ok(labels.includes("Overdue items"));
  assert.ok(labels.includes("At-risk items"));
  assert.ok(labels.includes("Blocked by dependencies"));
});

test("selected workstream defaults to a workstream that has blockers", () => {
  const dash = buildScenario();
  assert.equal(dash.selectedWorkstream?.workstream, "VENUE"); // first canonical with blockers
  const chosen = buildScenario({ selectedWorkstream: "FNB" });
  assert.equal(chosen.selectedWorkstream?.workstream, "FNB");
});

test("empty event yields graceful zeroed dashboard and perfect health", () => {
  const dash = buildTimelineDashboard({ event: EVENT, items: [], dependencies: [], now: NOW });
  assert.equal(dash.totals.totalItems, 0);
  assert.equal(dash.health.score, 100);
  assert.equal(dash.health.label, "Good");
  assert.equal(dash.blockers.length, 0);
  assert.equal(dash.stages.length, 5);
  assert.equal(dash.workstreams.length, 0);
  assert.equal(dash.health.drivers[0].label, "On track");
});

test("getEventTimelineDashboard enforces event read access server-side", () => {
  const source = readFileSync("src/server/services/timeline-dashboard.ts", "utf8");
  assert.ok(source.includes('assertEventAccessForUser(eventId, user, "read")'));
  // dashboard reads only canonical timeline tables
  assert.ok(source.includes("prisma.timelineItem.findMany"));
  assert.ok(source.includes("prisma.timelineDependency.findMany"));
  assert.equal(source.includes("prisma.task"), false);
});

test("dashboard route resolves the request user and is event-scoped", () => {
  const route = readFileSync("app/api/events/[eventId]/timeline-dashboard/route.ts", "utf8");
  assert.ok(route.includes("resolveRequestUser(request)"));
  assert.ok(route.includes("getEventTimelineDashboard(eventId, authResult.user"));
  assert.ok(route.includes("TimelineDashboardError"));
  assert.ok(route.includes('export const runtime = "nodejs"'));
  // an unauthenticated request short-circuits before any data is read
  assert.ok(route.includes('if ("error" in authResult)'));
});
