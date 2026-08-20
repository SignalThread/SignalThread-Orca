import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { SpeakerStatus } from "@prisma/client";
import {
  getEventCommandCenter,
  getEventCommandCenterLayout,
} from "@/src/server/services/event-command-center";
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

// Locks the Command Center load-path refactor: getEventCommandCenter now runs its
// independent reads as one Promise.all wave and derives the per-status speaker
// counts from a single groupBy. This asserts the derived aggregates still match
// the persisted data, and that the layout helper still returns the event phase.
test("Command Center: parallelized load reports correct aggregates", async (t) => {
  const harness = createHarnessOrSkip(t, "command-center-load");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;

    const roomA = await harness.createRoom({ eventId, name: "Ballroom A" });
    await harness.createRoom({ eventId, name: "Breakout B" });

    await harness.createMatrixRow({ eventId, roomId: roomA.id, sessionName: "Keynote" });
    await harness.createMatrixRow({ eventId, roomId: roomA.id, sessionName: "Panel" });
    await harness.createMatrixRow({ eventId, roomId: null, sessionName: "Unassigned Workshop" });

    await harness.createSpeaker({ eventId, name: "Needs Info Speaker", status: SpeakerStatus.NEEDS_INFO });
    await harness.createSpeaker({ eventId, name: "Confirmed One", status: SpeakerStatus.CONFIRMED });
    await harness.createSpeaker({ eventId, name: "Confirmed Two", status: SpeakerStatus.CONFIRMED });
    await harness.createSpeaker({ eventId, name: "Invited Speaker", status: SpeakerStatus.INVITED });

    const budget = await harness.createBudget({ eventId });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", forecastCents: 10000, actualCents: 5000 });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food & Beverage", forecastCents: 25000, actualCents: 0 });

    const payload = await getEventCommandCenter(eventId);

    // Counts sourced from the parallelized wave.
    assert.equal(payload.event.operations.roomStatus.set, 2, "roomsCount");
    assert.equal(payload.event.sessionReadiness.totalSessions, 3, "sessionsCount");

    // Speaker counts derived from the single groupBy.
    assert.equal(payload.event.speakers.totalSpeakers, 4, "total speakers");
    assert.equal(payload.event.speakers.tasksPending, 1, "NEEDS_INFO count");
    assert.equal(payload.event.speakers.travelStatus.confirmed, 2, "CONFIRMED count");
    // pending = invited + needsInfo = 1 + 1
    assert.equal(payload.event.speakers.travelStatus.pending, 2, "INVITED + NEEDS_INFO");
    assert.equal(payload.event.speakers.travelStatus.declined, 0, "CANCELLED count");

    // Budget aggregate.
    assert.equal(payload.event.financial.forecast, 35000, "forecast total");
    assert.equal(payload.event.financial.actual, 5000, "actual total");
    assert.equal(payload.event.financial.variance, 30000, "variance");

    assert.ok(typeof payload.event.phase === "string" && payload.event.phase.length > 0, "phase present");

    // Layout helper (lightweight path) still derives the same phase.
    const layout = await getEventCommandCenterLayout(eventId, roles.owner.accessUser);
    assert.equal(layout.eventId, eventId);
    assert.equal(layout.phase, payload.event.phase, "layout phase matches full payload phase");
  } finally {
    await harness.cleanup();
  }
});
