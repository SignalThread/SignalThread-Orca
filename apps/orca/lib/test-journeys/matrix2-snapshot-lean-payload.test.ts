import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventPersonRole } from "@prisma/client";
import {
  getMatrix2Snapshot,
  type Matrix2SnapshotDiagnostics,
} from "@/lib/matrix2";
import { updateMatrix2Session } from "@/lib/matrix2-session";
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

test("Matrix 2 snapshot loader stays set-based as sessions and assignments grow", async (t) => {
  const harness = createHarnessOrSkip(t, "matrix2-snapshot-lean");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const rooms = await Promise.all([
      harness.createRoom({ eventId, name: "Ballroom A", capacity: 200 }),
      harness.createRoom({ eventId, name: "Ballroom B", capacity: 150 }),
      harness.createRoom({ eventId, name: "Studio C", capacity: 80 }),
    ]);
    const speaker = await harness.createSpeaker({
      eventId,
      name: "Jordan Speaker",
      email: "jordan.speaker@planner.test",
    });
    const staff = await harness.createEventPerson({
      eventId,
      name: "Casey Producer",
      role: EventPersonRole.STAFF,
      email: "casey.producer@planner.test",
    });
    const budget = await harness.createBudget({ eventId });
    const template = await harness.createSessionRequirementTemplate({ eventId });
    const section = await harness.createSessionRequirementSection({ templateId: template.id, key: "ops", label: "Operations" });
    const requirement = await harness.createSessionRequirementItem({ sectionId: section.id, key: "confidence-monitor", label: "Confidence Monitor" });

    const sessions = [];
    for (let index = 0; index < 6; index += 1) {
      const room = rooms[index % rooms.length]!;
      const session = await harness.createMatrixRow({
        eventId,
        roomId: room.id,
        sessionName: `Performance Session ${index + 1}`,
        attendance: 40 + index,
      });
      sessions.push(session);
      await harness.createSessionSpeakerAssignment({ sessionId: session.id, speakerId: speaker.id });
      await harness.createSessionStaffAssignment({ sessionId: session.id, personId: staff.id, role: "Producer" });
      const budgetLine = await harness.createBudgetLineItem({
        budgetId: budget.id,
        matrixRowId: session.id,
        category: "A/V",
        lineItem: `Confidence Monitor ${index + 1}`,
        forecastCents: 5000 + index,
        actualCents: 1000 + index,
      });
      await harness.createSessionRequirementSelection({
        sessionId: session.id,
        itemId: requirement.id,
        budgetLineItemId: budgetLine.id,
        quantity: index + 1,
      });
      await updateMatrix2Session(eventId, session.id, {
        title: `Performance Session ${index + 1}`,
        roomId: room.id,
        startTime: `1${index}:00`,
        endTime: `1${index}:45`,
        expectedAttendance: 40 + index,
        avRequirements: [{ avType: "Confidence Monitor", quantity: index + 1 }],
        foodService: { serviceType: "Coffee Break", serviceStyle: "Station", headcount: 40 + index },
        foodAndBeverage: ["Coffee Break"],
      });
    }

    const diagnosticsState: { value?: Matrix2SnapshotDiagnostics } = {};
    const snapshot = await getMatrix2Snapshot(eventId, {
      onDiagnostics: (nextDiagnostics) => {
        diagnosticsState.value = nextDiagnostics;
      },
    });

    assert.equal(snapshot.sessions.length, sessions.length, "all seeded sessions are returned");
    assert.equal(snapshot.rooms.length, rooms.length, "rooms are returned");
    assert.equal(snapshot.people.length >= 1, true, "people collection is returned");
    assert.ok(diagnosticsState.value, "snapshot emitted diagnostics");
    const diagnostics = diagnosticsState.value;
    assert.equal(diagnostics.usedTransaction, false, "read-only snapshot queries do not lease an interactive transaction");
    assert.equal(diagnostics.rowCount, sessions.length, "diagnostics row count tracks payload");
    assert.equal(diagnostics.roomCount, rooms.length, "diagnostics room count tracks payload");
    assert.equal(diagnostics.peopleCount, snapshot.people.length, "diagnostics people count tracks payload");

    // Current snapshot reads are one bounded wave: event, rooms, rows, people,
    // speaker assignments, staff assignments, template, and requirement selections.
    // Keep the upper bounds loose enough for harmless set-based reshaping, but low
    // enough that one query per session/assignment fails loudly.
    assert.ok(diagnostics.queryGroups <= 7, `query groups stayed bounded: ${diagnostics.queryGroups}`);
    assert.ok(diagnostics.trackedPrismaCalls <= 10, `tracked Prisma calls stayed bounded: ${diagnostics.trackedPrismaCalls}`);

    for (const session of snapshot.sessions) {
      assert.equal(session.speakerAssignments.length, 1, "speaker assignments loaded set-wise");
      assert.equal(session.staffAssignments.length, 1, "staff assignments loaded set-wise");
      assert.equal(session.requirementSelections.length, 1, "requirement selections loaded set-wise");
      assert.equal(session.avRequirementsStructured.length, 1, "AV requirements preserved");
      assert.equal(session.foodAndBeverage.includes("Coffee Break"), true, "F&B fields preserved");
    }
  } finally {
    await harness.cleanup();
  }
});
