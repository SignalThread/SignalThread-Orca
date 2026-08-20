import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
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

// C2/C4: redundant standalone .count queries are removed. sessionFoodService is
// 1:1 with a session, so its count is derived from the already-fetched distinct
// session rows; staffing presence is derived from the distinct staffed-session
// rows. This locks that the derived values still drive the payload correctly.
test("Event Command Center source drops the redundant count queries", () => {
  const source = readFileSync("src/server/services/event-command-center.ts", "utf8");
  // The two redundant counts are gone.
  assert.equal(source.includes("prisma.sessionStaffAssignment.count("), false, "staff count query removed");
  assert.equal(source.includes("prisma.sessionFoodService.count("), false, "food-service count query removed");
  // Their values are derived from the distinct-session rows already fetched.
  assert.equal(source.includes("const fnbServiceCount = fnbServiceSessionRows.length"), true);
  assert.equal(source.includes("const hasStaffingData = staffSessionRows.length > 0"), true);
});

test("Event Command Center F&B completed count includes food-service records via derived count", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-query-dedupe");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const session = await harness.createMatrixRow({ eventId, sessionName: "Lunch" });
    // One food-service record (1:1 with the session).
    await harness.db.sessionFoodService.create({
      data: { sessionId: session.id, serviceType: "Plated", headcount: 100 },
    });

    const payload = await getEventCommandCenter(eventId);
    // completed = fnb catalog assignments (0) + food-service count (1, derived).
    assert.equal(payload.event.operations.fnbStatus.completed, 1, "food-service record counted as completed");
    assert.equal(payload.event.operations.fnbStatus.hasData, true, "F&B has data from the food-service record");
  } finally {
    await harness.cleanup();
  }
});
