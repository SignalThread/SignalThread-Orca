import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TimelineStatus } from "@prisma/client";
import { bulkUpdateTimelineItemSchema, createTimelineItemSchema, updateTimelineItemSchema } from "@/lib/timeline/types";
import { buildTimelineChildRollups } from "@/lib/timeline/rollup";
import { collectTimelineDescendantIds, forceCompleteProgress } from "@/src/server/services/timeline";

test("explicit timeline progress accepts only null or whole numbers 0 through 100", () => {
  for (const progress of [0, 1, 50, 100, null]) {
    assert.equal(createTimelineItemSchema.safeParse({ progress }).success, true, String(progress));
    assert.equal(updateTimelineItemSchema.safeParse({ progress }).success, true, String(progress));
    assert.equal(bulkUpdateTimelineItemSchema.safeParse({ itemIds: ["11111111-1111-4111-8111-111111111111"], patch: { progress } }).success, true, String(progress));
  }
  for (const progress of [-1, 1.5, 101, "50"]) {
    assert.equal(createTimelineItemSchema.safeParse({ progress }).success, false, String(progress));
  }
});

test("bulk patches preserve progress and reject unknown fields instead of silently stripping them", () => {
  const parsed = bulkUpdateTimelineItemSchema.parse({
    itemIds: ["11111111-1111-4111-8111-111111111111"],
    patch: { progress: 37 },
  });
  assert.equal(parsed.patch.progress, 37);
  assert.equal(bulkUpdateTimelineItemSchema.safeParse({
    itemIds: ["11111111-1111-4111-8111-111111111111"],
    patch: { progress: 37, unexpected: true },
  }).success, false);
});

test("Complete forces exact 100 progress without clamping other states", () => {
  assert.deepEqual(forceCompleteProgress({ status: TimelineStatus.COMPLETE, progress: 25 }), {
    status: TimelineStatus.COMPLETE,
    progress: 100,
  });
  assert.deepEqual(forceCompleteProgress({ status: TimelineStatus.IN_PROGRESS, progress: 25 }), {
    status: TimelineStatus.IN_PROGRESS,
    progress: 25,
  });
});

test("nested checklist rollups are deterministic and cycle-safe", () => {
  const rollups = buildTimelineChildRollups([
    { id: "parent", parentId: null, status: "IN_PROGRESS", progress: 10 },
    { id: "done", parentId: "parent", status: "COMPLETE", progress: 1 },
    { id: "nested", parentId: "parent", status: "IN_PROGRESS", progress: 5 },
    { id: "half", parentId: "nested", status: "IN_PROGRESS", progress: 50 },
    { id: "none", parentId: "nested", status: "NOT_STARTED", progress: null },
  ]);
  assert.deepEqual(rollups.get("nested"), { childCount: 2, completeCount: 0, percentComplete: 25 });
  assert.deepEqual(rollups.get("parent"), { childCount: 2, completeCount: 1, percentComplete: 63 });
});

test("recursive deletes collect all descendants and never unrelated rows", () => {
  assert.deepEqual(collectTimelineDescendantIds(["parent"], [
    { id: "parent", parentId: null },
    { id: "child", parentId: "parent" },
    { id: "grandchild", parentId: "child" },
    { id: "other", parentId: null },
  ]).sort(), ["child", "grandchild", "parent"]);
});

test("Roadmap UI exposes child creation, duplicate-submit lock, rollup, and reload-safe server data", () => {
  const page = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
  const list = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
  const service = readFileSync("src/server/services/timeline.ts", "utf8");
  assert.match(page, /createSubmissionInFlightRef\.current/);
  assert.match(list, /bulkMutationInFlightRef\.current/);
  assert.match(page, /setCreateParentId\(parent\.id\)/);
  assert.match(page, /parentId: createParentId/);
  assert.match(list, /Add subtask to/);
  assert.match(list, /subtasks complete/);
  assert.match(service, /parentId cannot create a timeline hierarchy cycle/);
  assert.match(service, /collectTimelineDescendantIds/);
});

test("generic Task API remains a versioned internal seam with no connector", () => {
  const api = readFileSync("components/tasks/task-api.ts", "utf8");
  const contract = readFileSync("../../docs/implementation/orca-task-api-contract.md", "utf8");
  assert.match(api, /TASK_API_CONTRACT_VERSION/);
  assert.match(api, /TASK_API_CAPABILITIES/);
  assert.match(contract, /Only `MANUAL` source and `INTERNAL` visibility/);
  assert.match(contract, /does not include provider identifiers, webhooks, OAuth, polling, synchronization jobs/);
});
