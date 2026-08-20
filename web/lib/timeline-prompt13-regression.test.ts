import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTimelineChildRollups } from "@/lib/timeline/rollup";
import { createTimelineItemSchema, updateTimelineItemSchema } from "@/lib/timeline/types";
import { buildTimelineDashboard } from "@/src/server/services/timeline-dashboard";

test("Roadmap Not Needed validation and rollups are deterministic", () => {
  assert.equal(createTimelineItemSchema.safeParse({ title: "Skip", disposition: "NOT_NEEDED" }).success, false);
  assert.equal(createTimelineItemSchema.safeParse({ title: "Skip", disposition: "NOT_NEEDED", dispositionReason: "Not applicable" }).success, true);
  assert.equal(updateTimelineItemSchema.safeParse({ disposition: "ACTIVE", dispositionReason: null }).success, true);
  const rollups = buildTimelineChildRollups([
    { id: "parent", parentId: null, status: "IN_PROGRESS", progress: 10 },
    { id: "done", parentId: "parent", status: "COMPLETE", progress: 100 },
    { id: "excluded", parentId: "parent", status: "NOT_STARTED", progress: 0, disposition: "NOT_NEEDED" },
  ]);
  assert.deepEqual(rollups.get("parent"), { childCount: 1, completeCount: 1, percentComplete: 100 });
});

test("Not Needed work is excluded from dashboard risk, overdue, dependency and progress totals", () => {
  const base = { department: null, workstream: null, planningStage: null, priority: "MEDIUM" as const, isCriticalPath: false, startDate: null, parentId: null, ownerUser: null };
  const dashboard = buildTimelineDashboard({
    event: { id: "event", name: "Event", startDate: null, endDate: null },
    now: new Date("2026-08-11T12:00:00Z"),
    items: [
      { ...base, id: "excluded", title: "Excluded overdue predecessor", status: "AT_RISK", endDate: new Date("2026-08-01T00:00:00Z"), disposition: "NOT_NEEDED" },
      { ...base, id: "active", title: "Active successor", status: "NOT_STARTED", endDate: new Date("2026-08-20T00:00:00Z"), disposition: "ACTIVE" },
    ],
    dependencies: [{ predecessorItemId: "excluded", successorItemId: "active" }],
  });
  assert.equal(dashboard.totals.totalItems, 1);
  assert.equal(dashboard.totals.blockerCount, 0);
  assert.equal(dashboard.blockers.some((item) => item.id === "excluded"), false);
});

test("Roadmap UI exposes accessible dependency, ordering, disposition, filter and responsive controls", () => {
  const page = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
  const list = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
  const dependencies = readFileSync("app/(shell)/timeline/_components/TimelineDependencyPanel.tsx", "utf8");
  assert.match(page, /TimelineDependencyPanel/);
  assert.match(page, /timeline-items\/reorder/);
  assert.match(list, /Mark Not Needed/);
  assert.match(list, /Reason required/);
  assert.match(list, /Filter by disposition/);
  assert.match(list, /Move \$\{item\.title\} up/);
  assert.match(list, /aria-modal="true"/);
  assert.match(dependencies, /Roadmap dependencies/);
  assert.match(dependencies, /sm:grid-cols-\[1fr_auto_1fr_auto\]/);
  assert.match(dependencies, /Remove dependency from/);
});

test("additive migration requires complete Not Needed evidence and preserves active defaults", () => {
  const sql = readFileSync("prisma/migrations/20260811180000_timeline_item_disposition/migration.sql", "utf8");
  assert.match(sql, /CREATE TYPE "TimelineItemDisposition" AS ENUM \('ACTIVE', 'NOT_NEEDED'\)/);
  assert.match(sql, /DEFAULT 'ACTIVE'/);
  for (const field of ["dispositionReason", "dispositionActorUserId", "dispositionAt"]) assert.match(sql, new RegExp(field));
  assert.match(sql, /TimelineItem_not_needed_evidence_check/);
});
