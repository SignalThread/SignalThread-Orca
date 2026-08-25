import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { MealPeriod } from "@prisma/client";
import { getEventCommandCenter } from "@/src/server/services/event-command-center";
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

// P1-6 regression: F&B pending must count sessions with unmet F&B demand (sessions
// tied to a real meal period without any F&B coverage), NOT active catalog items.
// A fully covered event with a large menu must show pending = 0.
test("Event Command Center F&B pending counts uncovered demand sessions, not catalog items", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-fnb");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;

    // Two meal-period sessions (F&B demand) and one non-meal session (no demand).
    const lunch = await harness.createMatrixRow({ eventId, sessionName: "Lunch" });
    const reception = await harness.createMatrixRow({ eventId, sessionName: "Reception" });
    const keynote = await harness.createMatrixRow({ eventId, sessionName: "Keynote" });
    await harness.db.matrixRow.update({ where: { id: lunch.id }, data: { mealPeriod: MealPeriod.LUNCH } });
    await harness.db.matrixRow.update({ where: { id: reception.id }, data: { mealPeriod: MealPeriod.RECEPTION } });
    await harness.db.matrixRow.update({ where: { id: keynote.id }, data: { mealPeriod: MealPeriod.NONE } });

    // A large catalog (supply) — must NOT count as pending demand.
    const items = [];
    for (let i = 0; i < 5; i++) {
      items.push(await harness.createEventFnbCatalogItem({ eventId, itemName: `Menu Item ${i}` }));
    }

    // Cover only the lunch session; reception remains uncovered.
    await harness.createSessionFnbCatalogAssignment({
      sessionId: lunch.id,
      eventFnbCatalogItemId: items[0].id,
    });
    // Assign a second item to the same covered session — must not change the count.
    await harness.createSessionFnbCatalogAssignment({
      sessionId: lunch.id,
      eventFnbCatalogItemId: items[1].id,
    });

    const uncovered = await getEventCommandCenter(eventId);
    // 1 uncovered demand session (reception); catalog supply is irrelevant.
    assert.equal(uncovered.event.operations.fnbStatus.pending, 1, "one uncovered demand session");

    // Now cover the reception session too → pending drops to 0 despite 5 menu items.
    await harness.createSessionFnbCatalogAssignment({
      sessionId: reception.id,
      eventFnbCatalogItemId: items[2].id,
    });
    const covered = await getEventCommandCenter(eventId);
    assert.equal(covered.event.operations.fnbStatus.pending, 0, "all demand covered → pending 0");
    // Catalog item count (5) must not leak into pending.
    assert.notEqual(covered.event.operations.fnbStatus.pending, 5, "catalog count is not pending");
  } finally {
    await harness.cleanup();
  }
});
