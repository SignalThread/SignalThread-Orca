import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { deleteMatrixRow, importMatrixRows, listMatrixRows, type MatrixImportInputRow } from "@/lib/matrix";
import { getMatrix2Snapshot } from "@/lib/matrix2";
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
  return createPlannerFixtureHarness({ runLabel: `matrix-import-idempotency-${randomUUID().slice(0, 8)}` });
}

const rows: MatrixImportInputRow[] = [{
  sessionName: "Imported workshop",
  dayDateIso: "2026-01-15",
  startTime: "13:00",
  endTime: "14:00",
  roomName: "Studio",
  setupType: "Classroom",
  avNeeds: null,
  attendance: null,
  notes: "",
  supplies: [{ label: "Pens", quantity: 24 }, { label: "Custom workbook", quantity: 24 }],
  signage: [{ label: "Directional signage", quantity: 2 }],
}];

test("matrix imports are atomic, idempotent, duplicate-aware, event-scoped, and persist operational categories", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const user = { id: roles.owner.user.id, orgId: roles.organization.id, role: roles.owner.user.role };
    const key = randomUUID();

    const first = await importMatrixRows(roles.event.id, user, rows, key);
    const retry = await importMatrixRows(roles.event.id, user, rows, key);
    const duplicateAttempt = await importMatrixRows(roles.event.id, user, rows, randomUUID());

    assert.deepEqual(first, { importedCount: 1, duplicateCount: 0, replayed: false });
    assert.deepEqual(retry, { importedCount: 1, duplicateCount: 0, replayed: true });
    assert.deepEqual(duplicateAttempt, { importedCount: 0, duplicateCount: 1, replayed: false });

    const importedSession = await harness.db.matrixRow.findFirstOrThrow({
      where: { eventId: roles.event.id, sessionName: "Imported workshop" },
    });
    assert.equal(await harness.db.matrixRow.count({
      where: { eventId: roles.event.id, sessionName: "Imported workshop" },
    }), 1);
    assert.equal(await harness.db.matrixImportBatch.count({ where: { eventId: roles.event.id } }), 2);

    const selections = await harness.db.sessionRequirementSelection.findMany({
      where: { sessionId: importedSession.id },
      include: { item: { include: { section: true } } },
      orderBy: { item: { label: "asc" } },
    });
    assert.deepEqual(selections.map((selection) => [
      selection.item.section.label,
      selection.item.label,
      selection.quantity,
    ]), [
      ["Signage", "Directional signage", 2],
    ]);
    const supplyAllocations = await harness.db.sessionSupplyAllocation.findMany({
      where: { sessionId: importedSession.id, state: "ACTIVE" },
      include: { SupplyItem: true },
      orderBy: { SupplyItem: { name: "asc" } },
    });
    assert.deepEqual(supplyAllocations.map((allocation) => [allocation.SupplyItem?.name, allocation.quantity]), [
      ["Custom workbook", 24],
      ["Pens", 24],
    ]);

    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      createdByUserId: roles.owner.user.id,
      name: "Other event",
    });
    const isolated = await importMatrixRows(otherEvent.id, user, rows, key);
    assert.deepEqual(isolated, { importedCount: 1, duplicateCount: 0, replayed: false });
    assert.equal(await harness.db.matrixRow.count({ where: { eventId: otherEvent.id, sessionName: "Imported workshop" } }), 1);

    await deleteMatrixRow(roles.event.id, importedSession.id, { id: roles.owner.user.id });
    const archived = await harness.db.matrixRow.findUniqueOrThrow({ where: { id: importedSession.id } });
    assert.ok(archived.archivedAt);
    assert.equal((await listMatrixRows(roles.event.id)).rows.some((row) => row.id === importedSession.id), false);
    assert.equal((await getMatrix2Snapshot(roles.event.id)).sessions.some((session) => session.id === importedSession.id), false);
    assert.equal(await harness.db.sessionRequirementSelection.count({ where: { sessionId: importedSession.id } }), 1);
    assert.equal(await harness.db.sessionSupplyAllocation.count({ where: { sessionId: importedSession.id } }), 2);
  } finally {
    await harness.cleanup();
  }
});
