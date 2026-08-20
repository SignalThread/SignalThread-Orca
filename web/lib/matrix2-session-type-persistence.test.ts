import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { updateMatrix2Session } from "@/lib/matrix2-session";
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
  return createPlannerFixtureHarness({ runLabel: `matrix2-session-type-${randomUUID().slice(0, 8)}` });
}

test("Matrix 2 Session Type updates persist through the existing session PATCH service", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const row = await harness.createMatrixRow({ eventId: roles.event.id, sessionName: "North America Breakout" });

    await updateMatrix2Session(roles.event.id, row.id, { sessionType: "Workshop" });

    const updated = await harness.db.matrixRow.findUniqueOrThrow({
      where: { id: row.id },
      select: { notes: true },
    });
    assert.match(updated.notes ?? "", /^Session Type: Workshop$/m);
  } finally {
    await harness.cleanup();
  }
});
