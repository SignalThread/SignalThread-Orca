import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventPersonRole } from "@prisma/client";
import { getMatrix2Snapshot, type Matrix2SessionRecord } from "@/lib/matrix2";
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

async function readSession(eventId: string, sessionId: string): Promise<Matrix2SessionRecord> {
  const snapshot = await getMatrix2Snapshot(eventId);
  const session = snapshot.sessions.find((entry) => entry.id === sessionId);
  assert.ok(session, "expected session to be present in snapshot");
  return session;
}

// Regression for the Matrix 2 session PATCH clobber risk: updateMatrix2Session used
// to behave like full-replace, so a payload omitting a field/array cleared or deleted
// the persisted data. It is now a guarded partial-merge: omitted fields leave existing
// data unchanged; explicit empty arrays still clear.
test("Matrix session PATCH: partial updates do not clobber unrelated data; explicit empties still clear", async (t) => {
  const harness = createHarnessOrSkip(t, "matrix2-partial-merge");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Breakout B" });
    const session = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Operations Briefing",
    });
    const speaker = await harness.createSpeaker({
      eventId: roles.event.id,
      name: "Avery Quinn",
      email: "avery.quinn@planner.test",
    });
    const staff = await harness.createEventPerson({
      eventId: roles.event.id,
      name: "Morgan Lee",
      role: EventPersonRole.STAFF,
      email: "morgan.lee@planner.test",
    });

    // 1. Full-payload save (the existing UI contract) establishes the baseline.
    await updateMatrix2Session(roles.event.id, session.id, {
      title: "Operations Briefing",
      sessionType: "Briefing",
      status: "Needs Review",
      roomId: room.id,
      startTime: "13:00",
      endTime: "13:45",
      expectedAttendance: 80,
      roomSetupType: "Classroom",
      speakers: [{ speakerId: speaker.id, name: speaker.name }],
      avRequirements: [{ avType: "Projector", quantity: 1 }],
      foodService: { serviceType: "Coffee Break", serviceStyle: "Station", headcount: 80 },
      foodAndBeverage: ["Coffee Service"],
      staffAssignments: [{
        personId: staff.id,
        name: staff.name,
        personRole: "staff",
        assignmentRole: "Stage Manager",
      }],
      notes: "Confirm screen height before doors.",
    });

    const baseline = await readSession(roles.event.id, session.id);
    assert.deepEqual(baseline.speakerAssignments.map((s) => s.speakerId), [speaker.id]);
    assert.equal(baseline.staffAssignments[0]?.personId, staff.id);
    assert.equal(baseline.staffAssignments[0]?.assignmentRole, "Stage Manager");
    assert.equal(baseline.status, "Needs Review");
    assert.equal(baseline.notes, "Confirm screen height before doors.");
    assert.equal(baseline.foodAndBeverage.includes("Coffee Service"), true);
    assert.equal(baseline.avRequirementsStructured[0]?.avType, "Projector");

    // 2. Partial scalar update (title only): omitted scalars + omitted arrays must be preserved.
    await updateMatrix2Session(roles.event.id, session.id, { title: "Renamed Ops Briefing" });
    const afterTitle = await readSession(roles.event.id, session.id);
    assert.equal(afterTitle.title, "Renamed Ops Briefing");
    // Omitted arrays did NOT delete rows.
    assert.deepEqual(afterTitle.speakerAssignments.map((s) => s.speakerId), [speaker.id]);
    assert.equal(afterTitle.staffAssignments[0]?.personId, staff.id);
    assert.equal(afterTitle.staffAssignments[0]?.assignmentRole, "Stage Manager");
    // Omitted scalars preserved.
    assert.equal(afterTitle.status, "Needs Review");
    assert.equal(afterTitle.notes, "Confirm screen height before doors.");
    assert.equal(afterTitle.foodAndBeverage.includes("Coffee Service"), true);
    assert.equal(afterTitle.avRequirementsStructured[0]?.avType, "Projector");

    // 3. Partial AV update: AV changes, everything else preserved.
    await updateMatrix2Session(roles.event.id, session.id, {
      avRequirements: [{ avType: "Microphone", quantity: 2 }],
    });
    const afterAv = await readSession(roles.event.id, session.id);
    assert.equal(afterAv.avRequirementsStructured[0]?.avType, "Microphone");
    assert.equal(afterAv.avRequirementsStructured[0]?.quantity, 2);
    assert.equal(afterAv.title, "Renamed Ops Briefing");
    assert.deepEqual(afterAv.speakerAssignments.map((s) => s.speakerId), [speaker.id]);
    assert.equal(afterAv.staffAssignments[0]?.personId, staff.id);
    assert.equal(afterAv.status, "Needs Review");
    assert.equal(afterAv.notes, "Confirm screen height before doors.");
    assert.equal(afterAv.foodAndBeverage.includes("Coffee Service"), true);

    // 4. Explicit empty speakers array still clears speaker assignments; staff untouched.
    await updateMatrix2Session(roles.event.id, session.id, { speakers: [] });
    const afterClearSpeakers = await readSession(roles.event.id, session.id);
    assert.equal(afterClearSpeakers.speakerAssignments.length, 0);
    assert.equal(afterClearSpeakers.staffAssignments[0]?.personId, staff.id);
    assert.equal(afterClearSpeakers.avRequirementsStructured[0]?.avType, "Microphone");

    // 5. Explicit empty staff array still clears staff assignments.
    await updateMatrix2Session(roles.event.id, session.id, { staffAssignments: [] });
    const afterClearStaff = await readSession(roles.event.id, session.id);
    assert.equal(afterClearStaff.staffAssignments.length, 0);
    // Unrelated data still intact after the clear.
    assert.equal(afterClearStaff.status, "Needs Review");
    assert.equal(afterClearStaff.avRequirementsStructured[0]?.avType, "Microphone");
  } finally {
    await harness.cleanup();
  }
});

test("expected attendance persists its truthful provenance without relabeling legacy values", async (t) => {
  const harness = createHarnessOrSkip(t, "matrix2-attendance-provenance");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const legacy = await harness.createMatrixRow({
      eventId: roles.event.id,
      sessionName: "Legacy attendance session",
      attendance: 80,
    });
    const manual = await harness.createMatrixRow({
      eventId: roles.event.id,
      sessionName: "Manual attendance session",
      attendance: null,
    });

    assert.equal((await readSession(roles.event.id, legacy.id)).expectedAttendanceSource, null);

    await updateMatrix2Session(roles.event.id, manual.id, {
      expectedAttendance: 125,
    });
    const saved = await readSession(roles.event.id, manual.id);
    assert.equal(saved.expectedAttendance, 125);
    assert.equal(saved.expectedAttendanceSource, "PLANNER_ESTIMATE");

    await updateMatrix2Session(roles.event.id, manual.id, {
      expectedAttendance: null,
      expectedAttendanceSource: "PLANNER_ESTIMATE",
    });
    const cleared = await readSession(roles.event.id, manual.id);
    assert.equal(cleared.expectedAttendance, null);
    assert.equal(cleared.expectedAttendanceSource, null);
  } finally {
    await harness.cleanup();
  }
});
