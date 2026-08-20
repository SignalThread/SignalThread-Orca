import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  TimelineServiceError,
  bulkUpdateTimelineItems,
  createTimelineItem,
  deleteTimelineItem,
  listTimelineItems,
  updateTimelineItem,
} from "@/src/server/services/timeline";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `timeline-progress-hierarchy-${randomUUID().slice(0, 8)}` });
}

test("Roadmap progress and nested checklist state persist, roll up safely, and remain event-scoped", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const user = roles.owner.accessUser;
    const parent = await createTimelineItem(roles.event.id, user, {
      title: "Launch checklist",
      status: "IN_PROGRESS",
      progress: 25,
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    });
    const child = await createTimelineItem(roles.event.id, user, {
      title: "Approve launch copy",
      parentId: parent.id,
      ownerUserId: roles.member.user.id,
      status: "IN_PROGRESS",
      progress: 40,
      startDate: "2026-08-02",
      endDate: "2026-08-03",
    });
    const grandchild = await createTimelineItem(roles.event.id, user, {
      title: "Legal review",
      parentId: child.id,
      status: "NOT_STARTED",
      startDate: "2026-08-02",
      endDate: "2026-08-02",
    });
    harness.ids.timelineItemIds.push(parent.id, child.id, grandchild.id);

    await assert.rejects(
      () => updateTimelineItem(roles.event.id, parent.id, user, { parentId: grandchild.id }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 400,
    );

    const completed = await updateTimelineItem(roles.event.id, child.id, user, {
      status: "COMPLETE",
      progress: 20,
    });
    assert.equal(completed.progress, 100);

    await bulkUpdateTimelineItems(roles.event.id, user, {
      itemIds: [parent.id, child.id],
      patch: { progress: 55 },
    });
    const fresh = await listTimelineItems(roles.event.id, user, { orderBy: "sortOrder" });
    assert.equal(fresh.find((item) => item.id === parent.id)?.progress, 55);
    assert.equal(fresh.find((item) => item.id === child.id)?.progress, 100, "completed rows remain 100");
    assert.equal(fresh.find((item) => item.id === child.id)?.parentId, parent.id);
    assert.equal(fresh.find((item) => item.id === child.id)?.ownerUser?.id, roles.member.user.id);
    assert.equal(fresh.find((item) => item.id === child.id)?.endDate?.toISOString().slice(0, 10), "2026-08-03");

    await assert.rejects(
      () => bulkUpdateTimelineItems(roles.event.id, roles.eventViewer.accessUser, {
        itemIds: [parent.id],
        patch: { progress: 60 },
      }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 403,
    );

    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: roles.owner.user.id,
      name: "Hierarchy isolation event",
    });
    await assert.rejects(
      () => createTimelineItem(otherEvent.id, user, { title: "Wrong parent", parentId: parent.id }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 400,
    );

    const deleted = await deleteTimelineItem(roles.event.id, parent.id, user);
    assert.equal(deleted.deletedCount, 3);
    const afterDelete = await listTimelineItems(roles.event.id, user, {});
    assert.equal(afterDelete.some((item) => [parent.id, child.id, grandchild.id].includes(item.id)), false);
  } finally {
    await harness.cleanup();
  }
});
