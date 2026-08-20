import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTimelineItemSchema, updateTimelineItemSchema } from "@/lib/timeline/types";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const serviceSource = readFileSync("src/server/services/timeline.ts", "utf8");
const bulkRouteSource = readFileSync("app/api/events/[eventId]/timeline-items/bulk/route.ts", "utf8");

test("create schema accepts workstream, planning stage, and critical path", () => {
  const parsed = createTimelineItemSchema.parse({
    kind: "BAR",
    title: "Confirm caterer",
    workstream: "FNB",
    planningStage: "BUILD",
    isCriticalPath: true,
    status: "IN_PROGRESS",
    priority: "HIGH",
    startDate: "2026-07-01",
    endDate: "2026-07-05",
  });
  assert.equal(parsed.workstream, "FNB");
  assert.equal(parsed.planningStage, "BUILD");
  assert.equal(parsed.isCriticalPath, true);
});

test("create schema rejects an invalid workstream/stage", () => {
  assert.throws(() => createTimelineItemSchema.parse({ workstream: "CATERING" }));
  assert.throws(() => createTimelineItemSchema.parse({ planningStage: "LAUNCH" }));
});

test("update schema can patch taxonomy fields independently", () => {
  const parsed = updateTimelineItemSchema.parse({ isCriticalPath: false });
  assert.equal(parsed.isCriticalPath, false);
  const ws = updateTimelineItemSchema.parse({ workstream: "SPONSORS", planningStage: "CLOSE" });
  assert.equal(ws.workstream, "SPONSORS");
  assert.equal(ws.planningStage, "CLOSE");
});

test("add flow sends taxonomy fields and targets the canonical timeline endpoint", () => {
  assert.ok(pageSource.includes("resolveCreateWorkstreamChoice"));
  assert.ok(pageSource.includes("workstream:"));
  assert.ok(pageSource.includes('department: createMode === "item" ? selectedItemWorkstream!.department : null'));
  assert.ok(pageSource.includes("planningStage: createPlanningStage"));
  assert.ok(pageSource.includes('isCriticalPath: createMode === "item" ? createIsCriticalPath : false'));
  // create flow must not write to the separate Task system
  assert.ok(pageSource.includes("/timeline-items"));
  assert.equal(pageSource.includes("services/tasks"), false);
  assert.equal(pageSource.includes("}/tasks"), false);
  assert.equal(pageSource.includes("department: normalizedDepartment"), false);
});

test("add item flow offers and persists custom workstream labels through department", () => {
  assert.ok(pageSource.includes('list="timeline-create-workstream-options"'));
  assert.ok(pageSource.includes("Create workstream:"));
  assert.ok(pageSource.includes("normalizeWorkstreamLabel(value)"));
  assert.ok(pageSource.includes("workstreamLabelKey(option.label) === normalizedKey"));
  assert.ok(pageSource.includes("department: normalized"));
  assert.ok(pageSource.includes("selectedItemWorkstream!.workstream"));
  assert.ok(pageSource.includes("selectedItemWorkstream!.department"));
});

test("list edit flow persists workstream, stage, and critical path", () => {
  // Cell-level editing: buildPatch constructs single-field patches via switch cases
  assert.ok(listSource.includes("function buildWorkstreamPatch"), "workstream patch helper");
  assert.ok(listSource.includes("department: option.department"), "custom workstream patch");
  assert.ok(listSource.includes("department: null"), "canonical workstream clears custom department");
  assert.ok(listSource.includes('return { planningStage: (value as TimelinePlanningStage) || null }'), "planningStage patch");
  // Critical path is persisted via commitCriticalPath which sends { isCriticalPath: checked }
  assert.ok(listSource.includes("isCriticalPath: checked"), "isCriticalPath patch in commitCriticalPath");
});

test("timeline service creates TimelineItem records only (never Task)", () => {
  // Create runs inside a transaction alongside the canonical audit write.
  assert.ok(serviceSource.includes("tx.timelineItem.create"));
  assert.ok(serviceSource.includes("workstream: normalized.workstream ?? null"));
  assert.ok(serviceSource.includes("planningStage: normalized.planningStage ?? null"));
  assert.ok(serviceSource.includes("isCriticalPath: normalized.isCriticalPath ?? false"));
  assert.equal(serviceSource.includes("prisma.task"), false);
  assert.equal(serviceSource.includes(".task.create"), false);
});

test("bulk update route enforces write access through the timeline service", () => {
  assert.ok(bulkRouteSource.includes("bulkUpdateTimelineItemSchema.parse(body)"));
  assert.ok(bulkRouteSource.includes("bulkUpdateTimelineItems(eventId, authResult.user"));
  assert.ok(serviceSource.includes("export async function bulkUpdateTimelineItems"));
  const bulkUpdateStart = serviceSource.indexOf("export async function bulkUpdateTimelineItems");
  const bulkDeleteStart = serviceSource.indexOf("export async function bulkDeleteTimelineItems");
  const bulkUpdateSource = serviceSource.slice(bulkUpdateStart, bulkDeleteStart);
  assert.ok(bulkUpdateSource.includes('assertTimelineEventAccess(eventId, user, "write")'));
});

test("bulk update validates selected ids against the current event", () => {
  const bulkUpdateStart = serviceSource.indexOf("export async function bulkUpdateTimelineItems");
  const bulkDeleteStart = serviceSource.indexOf("export async function bulkDeleteTimelineItems");
  const bulkUpdateSource = serviceSource.slice(bulkUpdateStart, bulkDeleteStart);
  assert.ok(bulkUpdateSource.includes("where: { eventId, id: { in: itemIds } }"));
  assert.ok(bulkUpdateSource.includes("skippedCount"));
  assert.ok(bulkUpdateSource.includes("where: { eventId, id: { in: ordinaryIds } }"));
  assert.ok(bulkUpdateSource.includes("where: { eventId, id: { in: completedIds } }"));
});
