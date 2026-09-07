import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { auditOperationalExport, previewOperationalExport } from "@/lib/operational-export-service";
import { publishSessionAgenda, replaceSessionShowFlow } from "@/lib/session-show-flow";
import { createPlannerFixtureHarness, hasPlannerTestDatabaseUrl, type PlannerFixtureHarness } from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `handoff-${randomUUID().slice(0, 8)}` });
}

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

test("operational handoffs are event-scoped, publication-safe, audited and deterministically versioned", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Grand Ballroom" });
    const session = await harness.createMatrixRow({ eventId: roles.event.id, roomId: room.id, sessionName: "Opening", startTime: time("09:00"), endTime: time("10:00"), includeInOfficialAgenda: true });
    await harness.db.matrixRow.update({ where: { id: session.id }, data: { notes: "PRIVATE INTERNAL ROUTE", publicDescription: "Published welcome" } });
    await replaceSessionShowFlow(roles.event.id, session.id, [{ timingMode: "OFFSET", offsetMin: 0, durationMin: 10, label: "Welcome", internalNotes: "PRIVATE CUE", publicDescription: "Opening remarks", visibility: "PUBLIC" }], { expectedRevision: 0, actorUserId: roles.owner.user.id });
    await publishSessionAgenda(roles.event.id, session.id, { expectedRevision: 1, actorUserId: roles.owner.user.id });

    const first = await previewOperationalExport(roles.event.id, "internal", {});
    assert.equal(first.metadata.projectionVersion, 1);
    assert.equal(first.rowCount, 1);
    assert.match(first.rows.flat().join(" "), /PRIVATE INTERNAL ROUTE/);
    await auditOperationalExport({ eventId: roles.event.id, userId: roles.owner.user.id, format: "csv", projection: first });
    const regenerated = await previewOperationalExport(roles.event.id, "internal", {});
    assert.equal(regenerated.metadata.projectionVersion, 1);
    assert.equal(regenerated.checksum, first.checksum);

    const filtered = await previewOperationalExport(roles.event.id, "hotel", { date: "1999-01-01" });
    assert.equal(filtered.rowCount, 0);
    const publicProjection = await previewOperationalExport(roles.event.id, "public", {});
    const publicText = publicProjection.rows.flat().join(" ");
    assert.match(publicText, /Published welcome/);
    assert.match(publicText, /Opening remarks/);
    assert.doesNotMatch(publicText, /PRIVATE/);

    await harness.db.matrixRow.update({ where: { id: session.id }, data: { setupType: "Classroom" } });
    const changed = await previewOperationalExport(roles.event.id, "internal", {});
    assert.equal(changed.metadata.projectionVersion, 2);
    assert.notEqual(changed.metadata.sourceVersion, first.metadata.sourceVersion);
    assert.equal(await harness.db.eventFnbExportRecord.count({ where: { eventId: roles.event.id } }), 1, "previews never create audit rows");

    const otherEvent = await harness.createEvent({ orgId: roles.organization.id, createdByUserId: roles.owner.user.id, name: "Other event" });
    await harness.createMatrixRow({ eventId: otherEvent.id, sessionName: "CROSS EVENT SECRET", startTime: time("11:00"), endTime: time("12:00") });
    assert.doesNotMatch((await previewOperationalExport(roles.event.id, "internal", {})).rows.flat().join(" "), /CROSS EVENT SECRET/);
  } finally {
    await harness.cleanup();
  }
});
