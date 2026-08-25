import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { createTimelineDependency, deleteTimelineDependency } from "@/src/server/services/timeline";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// Regression for the Timeline dependency cycle-detection gap: createTimelineDependency
// blocked self-links, cross-event links, and duplicates, but allowed transitive cycles
// (A->B, B->A or A->B->C->A). It now rejects any edge whose successor can already reach
// the proposed predecessor, while still permitting valid non-cyclic chains and diamonds.
test("Timeline dependency: rejects cycles, allows valid chains", async (t) => {
  const harness = createHarnessOrSkip(t, "timeline-dep-cycle");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const editor = roles.member.accessUser;

    const a = await harness.createTimelineItem({ eventId: roles.event.id, title: "Item A" });
    const b = await harness.createTimelineItem({ eventId: roles.event.id, title: "Item B" });
    const c = await harness.createTimelineItem({ eventId: roles.event.id, title: "Item C" });

    // 1. Valid dependency A->B succeeds.
    const dependencyAB = await createTimelineDependency(roles.event.id, editor, {
      predecessorItemId: a.id,
      successorItemId: b.id,
    });
    harness.ids.timelineDependencyIds.push(dependencyAB.id);
    assert.ok(dependencyAB.id, "expected A->B dependency to be created");

    // 2. Self-dependency rejected (degenerate 1-node cycle).
    await assert.rejects(
      () => createTimelineDependency(roles.event.id, editor, { predecessorItemId: a.id, successorItemId: a.id }),
      (error) => error instanceof Error && error.message === "A dependency cannot link an item to itself",
    );

    // 3. Two-node cycle rejected: B->A would close the loop with the existing A->B.
    await assert.rejects(
      () => createTimelineDependency(roles.event.id, editor, { predecessorItemId: b.id, successorItemId: a.id }),
      (error) => error instanceof Error && error.message === "Adding this dependency would create a circular dependency",
    );
    assert.equal(await harness.db.timelineDependency.count({ where: { eventId: roles.event.id } }), 1);

    // 4. Multi-node cycle rejected: with A->B and B->C, C->A would close A->B->C->A.
    const dependencyBC = await createTimelineDependency(roles.event.id, editor, {
      predecessorItemId: b.id,
      successorItemId: c.id,
    });
    harness.ids.timelineDependencyIds.push(dependencyBC.id);
    await assert.rejects(
      () => createTimelineDependency(roles.event.id, editor, { predecessorItemId: c.id, successorItemId: a.id }),
      (error) => error instanceof Error && error.message === "Adding this dependency would create a circular dependency",
    );
    assert.equal(await harness.db.timelineDependency.count({ where: { eventId: roles.event.id } }), 2);

    // 5. Valid non-cyclic edge across an existing chain still works (diamond A->C alongside A->B->C).
    const dependencyAC = await createTimelineDependency(roles.event.id, editor, {
      predecessorItemId: a.id,
      successorItemId: c.id,
    });
    harness.ids.timelineDependencyIds.push(dependencyAC.id);
    assert.ok(dependencyAC.id, "expected non-cyclic A->C dependency to be allowed");

    // 6. Cross-event dependency rejected (item from a different event).
    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: roles.owner.user.id,
    });
    const otherItem = await harness.createTimelineItem({ eventId: otherEvent.id, title: "Other Event Item" });
    await assert.rejects(
      () => createTimelineDependency(roles.event.id, editor, { predecessorItemId: a.id, successorItemId: otherItem.id }),
      (error) =>
        error instanceof Error &&
        error.message === "Both predecessor and successor items must belong to this event",
    );

    // 7. Deleting a dependency still works and reopens the previously-blocked direction.
    await deleteTimelineDependency(roles.event.id, dependencyAB.id, editor);
    assert.equal(await harness.db.timelineDependency.count({ where: { id: dependencyAB.id } }), 0);
    // With A->B gone (B->C and A->C remain), B->A no longer forms a cycle.
    const dependencyBA = await createTimelineDependency(roles.event.id, editor, {
      predecessorItemId: b.id,
      successorItemId: a.id,
    });
    harness.ids.timelineDependencyIds.push(dependencyBA.id);
    assert.ok(dependencyBA.id, "expected B->A to be allowed once the A->B edge is removed");
  } finally {
    await harness.cleanup();
  }
});
