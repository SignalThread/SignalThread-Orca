import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  TimelineServiceError,
  createTimelineDependency,
  createTimelineItem,
  deleteTimelineItem,
  listTimelineDependencies,
  listTimelineItems,
  reorderTimelineItem,
  updateTimelineItem,
} from "@/src/server/services/timeline";
import { getEventTimelineDashboard } from "@/src/server/services/timeline-dashboard";
import { createPlannerFixtureHarness, hasPlannerTestDatabaseUrl, type PlannerFixtureHarness } from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) { t.skip("DATABASE_URL is required"); return null; }
  return createPlannerFixtureHarness({ runLabel: `prompt13-${randomUUID().slice(0, 8)}` });
}

test("Prompt 13 hierarchy, disposition, dependency, ordering, concurrency and isolation persist", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    const user = roles.owner.accessUser;
    const parent = await createTimelineItem(roles.event.id, user, { title: "Parent", startDate: "2026-08-01", endDate: "2026-08-02" });
    const child = await createTimelineItem(roles.event.id, user, { title: "Child", parentId: parent.id });
    const grandchild = await createTimelineItem(roles.event.id, user, { title: "Grandchild", parentId: child.id });
    harness.ids.timelineItemIds.push(parent.id, child.id, grandchild.id);
    await assert.rejects(
      () => createTimelineItem(roles.event.id, user, { title: "Too deep", parentId: grandchild.id }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 400 && /three levels/.test(error.message),
    );

    await assert.rejects(
      () => updateTimelineItem(roles.event.id, child.id, user, { disposition: "NOT_NEEDED" }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 400,
    );
    await assert.rejects(
      () => updateTimelineItem(roles.event.id, parent.id, user, { disposition: "NOT_NEEDED", dispositionReason: "Scope removed" }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 409,
    );

    const predecessor = await createTimelineItem(roles.event.id, user, { title: "Venue approval", startDate: "2026-07-01", endDate: "2026-07-02", sortOrder: 20 });
    const successor = await createTimelineItem(roles.event.id, user, { title: "Release rooming list", sortOrder: 21 });
    harness.ids.timelineItemIds.push(predecessor.id, successor.id);
    const dependency = await createTimelineDependency(roles.event.id, user, { predecessorItemId: predecessor.id, successorItemId: successor.id });
    harness.ids.timelineDependencyIds.push(dependency.id);
    assert.equal((await listTimelineDependencies(roles.event.id, user))[0]?.blocked, true);

    const notNeeded = await updateTimelineItem(roles.event.id, predecessor.id, user, {
      disposition: "NOT_NEEDED",
      dispositionReason: "Venue package no longer includes this deliverable",
      expectedUpdatedAt: predecessor.updatedAt.toISOString(),
    });
    assert.equal(notNeeded.disposition, "NOT_NEEDED");
    assert.equal(notNeeded.dispositionActorUserId, roles.owner.user.id);
    assert.ok(notNeeded.dispositionAt);
    assert.equal((await listTimelineDependencies(roles.event.id, user))[0]?.blocked, false, "valid Not Needed predecessor fulfills the dependency");

    const dashboard = await getEventTimelineDashboard(roles.event.id, user, { now: new Date("2026-08-11T12:00:00Z") });
    assert.equal(dashboard.blockers.some((item) => item.id === predecessor.id), false);
    assert.equal(dashboard.totals.totalItems, 4, "Not Needed task is excluded from total and overdue rollups");

    await assert.rejects(
      () => updateTimelineItem(roles.event.id, predecessor.id, user, { disposition: "ACTIVE", dispositionReason: null, expectedUpdatedAt: predecessor.updatedAt.toISOString() }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 409,
    );

    const firstOrder = await listTimelineItems(roles.event.id, user, { orderBy: "sortOrder" });
    const successorBefore = firstOrder.find((item) => item.id === successor.id)!;
    const reorderResult = await reorderTimelineItem(roles.event.id, user, { itemId: successor.id, direction: "up", expectedSortOrder: successorBefore.sortOrder });
    const reorderedSuccessor = reorderResult.items.find((item) => item.id === successor.id);
    assert.ok(reorderedSuccessor, "reorder returns the successor's current optimistic-concurrency token");
    const savedAfterReorder = await updateTimelineItem(roles.event.id, successor.id, user, {
      status: "IN_PROGRESS",
      expectedUpdatedAt: reorderedSuccessor.updatedAt.toISOString(),
    });
    assert.equal(savedAfterReorder.status, "IN_PROGRESS", "a post-reorder inline edit accepts the returned token");
    const reordered = await listTimelineItems(roles.event.id, user, { orderBy: "sortOrder" });
    assert.ok(reordered.findIndex((item) => item.id === successor.id) < reordered.findIndex((item) => item.id === predecessor.id));
    const staleAttempts = await Promise.allSettled([
      reorderTimelineItem(roles.event.id, user, { itemId: successor.id, direction: "down", expectedSortOrder: successorBefore.sortOrder }),
      reorderTimelineItem(roles.event.id, user, { itemId: successor.id, direction: "down", expectedSortOrder: successorBefore.sortOrder }),
    ]);
    assert.equal(staleAttempts.every((result) => result.status === "rejected"), true, "stale reorder snapshots never overwrite newer order");
    const freshSuccessor = (await listTimelineItems(roles.event.id, user, { orderBy: "sortOrder" })).find((item) => item.id === successor.id)!;
    const concurrent = await Promise.allSettled([
      reorderTimelineItem(roles.event.id, user, { itemId: successor.id, direction: "down", expectedSortOrder: freshSuccessor.sortOrder }),
      reorderTimelineItem(roles.event.id, user, { itemId: successor.id, direction: "down", expectedSortOrder: freshSuccessor.sortOrder }),
    ]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);

    await assert.rejects(
      () => listTimelineDependencies(roles.event.id, roles.unrelatedOtherOrgMember.accessUser),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 403,
    );
    const activities = await harness.db.eventActivity.findMany({ where: { eventId: roles.event.id, entityId: predecessor.id }, orderBy: { createdAt: "asc" } });
    assert.ok(activities.some((activity) => JSON.stringify(activity.changes).includes("Venue package no longer includes this deliverable")));
    await deleteTimelineItem(roles.event.id, predecessor.id, user);
    assert.equal(await harness.db.timelineDependency.count({ where: { id: dependency.id } }), 0, "deleting a dependency endpoint removes the link");
  } finally { await harness.cleanup(); }
});
