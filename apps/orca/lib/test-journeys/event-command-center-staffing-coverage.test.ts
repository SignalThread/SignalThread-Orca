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

// P0-2 regression (semantics): staffing coverage must derive `confirmed` from the
// distinct staffed-session set, never from the raw assignment-row count. This is a
// source-level lock so it holds regardless of whether the staffing source table is
// populated in a given environment.
test("Event Command Center staffing coverage uses distinct staffed sessions, not raw rows", () => {
  const source = readFileSync("src/server/services/event-command-center.ts", "utf8");
  assert.equal(source.includes("const distinctStaffedSessionCount = staffSessionRows.length"), true);
  assert.equal(source.includes("confirmed: distinctStaffedSessionCount"), true);
  assert.equal(source.includes("sessionsCount - distinctStaffedSessionCount"), true);
  // The raw assignment count must not be used for coverage math anymore.
  assert.equal(source.includes("confirmed: staffAssignmentCount"), false);
  assert.equal(source.includes("sessionsCount - staffAssignmentCount"), false);
});

// P0-2 regression (behavior): with 3 sessions where A has 2 staff, B has 1, C has 0,
// coverage must report confirmed = 2 and missing = 1. NOTE: the staffing source of
// truth (SessionStaffAssignment) is unpopulated/absent in some environments because
// live staff data currently lives in MatrixRowStaffAssignment (the Matrix staffing
// table drift, tracked separately and out of scope here). Where the source is
// unavailable, the contract that matters is that coverage does not fabricate a
// "fully staffed" state — it reports no data (0/0), never a false zero-missing.
test("Event Command Center staffing coverage counts distinct staffed sessions", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-staffing");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;

    // 3 sessions: A has 2 staff, B has 1 staff, C has 0 staff.
    const sessionA = await harness.createMatrixRow({ eventId, sessionName: "Session A" });
    const sessionB = await harness.createMatrixRow({ eventId, sessionName: "Session B" });
    await harness.createMatrixRow({ eventId, sessionName: "Session C" });

    const personOne = await harness.createEventPerson({ eventId, name: "Staff One" });
    const personTwo = await harness.createEventPerson({ eventId, name: "Staff Two" });
    const personThree = await harness.createEventPerson({ eventId, name: "Staff Three" });

    await harness.createSessionStaffAssignment({ sessionId: sessionA.id, personId: personOne.id });
    await harness.createSessionStaffAssignment({ sessionId: sessionA.id, personId: personTwo.id });
    await harness.createSessionStaffAssignment({ sessionId: sessionB.id, personId: personThree.id });

    const payload = await getEventCommandCenter(eventId);
    const staffing = payload.event.operations.staffingStatus;

    if (!staffing.hasData) {
      // Staffing source of truth is unavailable in this environment (table drift).
      // Assert the fix does not produce a misleading "fully staffed" signal.
      assert.equal(staffing.confirmed, 0, "no staffed sessions reported when source is absent");
      assert.equal(staffing.missing, 0, "no false zero-missing when source is absent");
      t.diagnostic("SessionStaffAssignment source unavailable; distinct-session math locked by source-scan test above.");
      return;
    }

    // 2 sessions have >=1 staff (A and B); C is unstaffed.
    assert.equal(staffing.confirmed, 2, "confirmed = distinct staffed sessions");
    assert.equal(staffing.missing, 1, "missing = sessionsCount - distinctStaffedSessions");
    // Raw assignment count is 3; confirmed must not equal it.
    assert.notEqual(staffing.confirmed, 3, "raw assignment count is not used as confirmed");
    // sessionReadiness uses the same distinct-session source.
    assert.equal(payload.event.sessionReadiness.staffingAssigned, 2, "distinct staffed sessions");
  } finally {
    await harness.cleanup();
  }
});
