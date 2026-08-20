import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { MatrixError, updateMatrixRow } from "@/lib/matrix";
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

// Lock-in for the legacy Matrix rows PATCH (updateMatrixRow). Unlike the Matrix 2
// session PATCH (which used to full-replace), this route already builds its Prisma
// update incrementally and only writes fields the caller provided. These tests guard
// against a future regression into full-replace, especially for the board
// drag/reorder path that sends only room/time/sortOrder.
test("Legacy Matrix row PATCH: drag/reorder-style partial updates do not clobber unrelated fields", async (t) => {
  const harness = createHarnessOrSkip(t, "matrix-rows-partial");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const roomA = await harness.createRoom({ eventId: roles.event.id, name: "Room A" });
    const roomB = await harness.createRoom({ eventId: roles.event.id, name: "Room B" });
    const row = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: roomA.id,
      sessionName: "Keynote",
    });

    // Establish a rich baseline through the same service under test.
    await updateMatrixRow(roles.event.id, row.id, {
      startTime: "09:00",
      endTime: "10:00",
      sessionName: "Keynote",
      setup: "Theater",
      attendance: 250,
      meal: "Lunch",
      avNeeds: "Projector, Mic",
      notes: "Status: Confirmed\nSpeakers: Avery Quinn\n\nDoors at 8:45.",
      sortOrder: 1,
    });

    const readRow = () =>
      harness.db.matrixRow.findUniqueOrThrow({
        where: { id: row.id },
        select: {
          sessionName: true,
          setupType: true,
          attendance: true,
          mealPeriod: true,
          avNeeds: true,
          notes: true,
          roomId: true,
          startTime: true,
          endTime: true,
          sortOrder: true,
        },
      });

    const baseline = await readRow();

    // 1. sortOrder-only reorder (the shifted-neighbours payload). Nothing else moves.
    await updateMatrixRow(roles.event.id, row.id, { sortOrder: 7 });
    const afterReorder = await readRow();
    assert.equal(afterReorder.sortOrder, 7);
    assert.equal(afterReorder.sessionName, baseline.sessionName);
    assert.equal(afterReorder.setupType, baseline.setupType);
    assert.equal(afterReorder.attendance, baseline.attendance);
    assert.equal(afterReorder.mealPeriod, baseline.mealPeriod);
    assert.equal(afterReorder.avNeeds, baseline.avNeeds);
    assert.equal(afterReorder.notes, baseline.notes);
    assert.equal(afterReorder.roomId, baseline.roomId);
    assert.deepEqual(afterReorder.startTime, baseline.startTime);
    assert.deepEqual(afterReorder.endTime, baseline.endTime);

    // 2. room + time move (the dragged-session payload). Only room/time change.
    await updateMatrixRow(roles.event.id, row.id, {
      roomId: roomB.id,
      room: roomB.name,
      startTime: "14:00",
      endTime: "14:30",
    });
    const afterMove = await readRow();
    assert.equal(afterMove.roomId, roomB.id);
    assert.equal(afterMove.startTime?.getUTCHours(), 14);
    assert.equal(afterMove.endTime?.getUTCMinutes(), 30);
    // Unrelated fields preserved.
    assert.equal(afterMove.sessionName, baseline.sessionName);
    assert.equal(afterMove.setupType, baseline.setupType);
    assert.equal(afterMove.attendance, baseline.attendance);
    assert.equal(afterMove.mealPeriod, baseline.mealPeriod);
    assert.equal(afterMove.avNeeds, baseline.avNeeds);
    assert.equal(afterMove.notes, baseline.notes);
    assert.equal(afterMove.sortOrder, 7);
  } finally {
    await harness.cleanup();
  }
});

test("Legacy Matrix row PATCH: an empty editable payload is rejected, not silently applied", async (t) => {
  const harness = createHarnessOrSkip(t, "matrix-rows-empty");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const row = await harness.createMatrixRow({ eventId: roles.event.id, sessionName: "Session" });

    await assert.rejects(
      () => updateMatrixRow(roles.event.id, row.id, {}),
      (error) => error instanceof MatrixError && error.status === 400,
    );
  } finally {
    await harness.cleanup();
  }
});
