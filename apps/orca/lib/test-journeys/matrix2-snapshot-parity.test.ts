import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventPersonRole } from "@prisma/client";
import { getMatrix2Snapshot, type Matrix2SessionRecord } from "@/lib/matrix2";
import { updateMatrix2Session } from "@/lib/matrix2-session";
import { SESSION_REQUIREMENT_QUANTITY_MAX } from "@/lib/session-requirement-quantity";
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

const SNAPSHOT_KEYS = ["dates", "event", "people", "requirementTemplate", "rooms", "sessions"];
const SESSION_KEYS = [
  "avRequirements",
  "avRequirementsStructured",
  "createdAt",
  "date",
  "endTime",
  "eventId",
  "expectedAttendance",
  "foodAndBeverage",
  "foodService",
  "id",
  "notes",
  "requirementSelections",
  "roomCapacity",
  "roomId",
  "roomName",
  "roomSetup",
  "rowId",
  "sessionType",
  "sortOrder",
  "speakerAssignments",
  "speakers",
  "staffAssigned",
  "staffAssignments",
  "startTime",
  "status",
  "title",
  "updatedAt",
];

test("Matrix 2 snapshot preserves Run of Show payload shape for board and drawer", async (t) => {
  const harness = createHarnessOrSkip(t, "matrix2-snapshot-parity");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const room = await harness.createRoom({ eventId, name: "Grand Ballroom", capacity: 275 });
    const session = await harness.createMatrixRow({
      eventId,
      roomId: room.id,
      sessionName: "Executive Keynote",
      attendance: 240,
      setupType: "Theater",
    });
    const speaker = await harness.createSpeaker({
      eventId,
      name: "Avery Quinn",
      title: "Chief Product Officer",
      company: "OrcaOS",
      email: "avery.quinn@planner.test",
    });
    await harness.createSessionSpeakerAssignment({ sessionId: session.id, speakerId: speaker.id });
    const staff = await harness.createEventPerson({
      eventId,
      name: "Morgan Lee",
      role: EventPersonRole.STAFF,
      email: "morgan.lee@planner.test",
    });
    await harness.createSessionStaffAssignment({ sessionId: session.id, personId: staff.id, role: "Stage Manager" });

    const budget = await harness.createBudget({ eventId });
    const template = await harness.createSessionRequirementTemplate({ eventId });
    const section = await harness.createSessionRequirementSection({ templateId: template.id, key: "av", label: "A/V" });
    const requirement = await harness.createSessionRequirementItem({ sectionId: section.id, key: "projector", label: "Projector" });
    const budgetLine = await harness.createBudgetLineItem({
      budgetId: budget.id,
      matrixRowId: session.id,
      category: "A/V",
      lineItem: "Projector",
      forecastCents: 10000,
      actualCents: 4000,
    });
    await harness.createSessionRequirementSelection({
      sessionId: session.id,
      itemId: requirement.id,
      budgetLineItemId: budgetLine.id,
      quantity: 2,
    });

    await updateMatrix2Session(eventId, session.id, {
      title: "Executive Keynote",
      sessionType: "Keynote",
      status: "Confirmed",
      roomId: room.id,
      startTime: "10:15",
      endTime: "11:05",
      expectedAttendance: 240,
      roomSetupType: "Theater",
      avRequirements: [{ avType: "Projector", quantity: SESSION_REQUIREMENT_QUANTITY_MAX }],
      foodService: { serviceType: "Coffee Break", serviceStyle: "Station", headcount: 240 },
      foodAndBeverage: ["Coffee Break"],
      notes: "Doors open at 10:00.",
    });

    const snapshot = await getMatrix2Snapshot(eventId);
    assert.deepEqual(Object.keys(snapshot).sort(), SNAPSHOT_KEYS, "top-level snapshot keys");
    assert.deepEqual(Object.keys(snapshot.event).sort(), ["endDate", "id", "name", "startDate", "timezone"]);
    assert.equal(snapshot.event.id, eventId);
    assert.ok(snapshot.dates.includes(snapshot.sessions[0]?.date ?? ""), "dates include session day");
    assert.equal(snapshot.rooms.length, 1);
    assert.deepEqual(Object.keys(snapshot.rooms[0]!).sort(), ["capacity", "id", "name"]);
    assert.equal(snapshot.people.some((person) => person.id === staff.id), true, "people collection includes staff");
    assert.deepEqual(Object.keys(snapshot.people[0]!).sort(), ["company", "email", "id", "name", "role"]);
    assert.ok(snapshot.requirementTemplate.id, "requirement template present");
    assert.ok(Array.isArray(snapshot.requirementTemplate.sections), "requirement sections present");
    assert.equal(snapshot.sessions.length, 1);

    const row = snapshot.sessions[0] as Matrix2SessionRecord;
    assert.deepEqual(Object.keys(row).sort(), SESSION_KEYS, "session keys");
    assert.equal(row.id, session.id);
    assert.equal(row.rowId, session.id);
    assert.equal(row.eventId, eventId);
    assert.equal(row.title, "Executive Keynote");
    assert.equal(row.roomId, room.id);
    assert.equal(row.roomName, "Grand Ballroom");
    assert.equal(row.roomCapacity, 275);
    assert.equal(row.startTime, "10:15");
    assert.equal(row.endTime, "11:05");
    assert.equal(row.sessionType, "Keynote");
    assert.equal(row.status, "Confirmed");
    assert.equal(row.expectedAttendance, 240);
    assert.equal(row.roomSetup, "Theater");
    assert.equal(row.notes, "Doors open at 10:00.");
    assert.equal(row.speakerAssignments[0]?.speakerId, speaker.id);
    assert.equal(row.staffAssignments[0]?.personId, staff.id);
    assert.equal(row.staffAssignments[0]?.assignmentRole, "Stage Manager");
    assert.equal(row.avRequirementsStructured[0]?.avType, "Projector");
    assert.equal(row.avRequirementsStructured[0]?.quantity, SESSION_REQUIREMENT_QUANTITY_MAX);
    assert.equal(row.foodAndBeverage.includes("Coffee Break"), true);
    assert.equal(row.foodService?.serviceType, "Coffee Break");
    assert.equal(row.foodService?.headcount, 240);
    assert.equal(row.requirementSelections[0]?.itemId, requirement.id);
    assert.equal(row.requirementSelections[0]?.quantity, 2);
    assert.equal(row.requirementSelections[0]?.linkedBudgetLineItem?.id, budgetLine.id);

    await assert.rejects(
      updateMatrix2Session(eventId, session.id, {
        avRequirements: [{ avType: "Projector", quantity: SESSION_REQUIREMENT_QUANTITY_MAX + 1 }],
      }),
      /must be a whole number from 1 to 2,147,483,647/,
    );
    const afterRejectedMaximum = await getMatrix2Snapshot(eventId);
    assert.equal(
      afterRejectedMaximum.sessions[0]?.avRequirementsStructured[0]?.quantity,
      SESSION_REQUIREMENT_QUANTITY_MAX,
      "rejected max+1 write leaves the persisted maximum unchanged",
    );

    await updateMatrix2Session(eventId, session.id, {
      avRequirements: [{ avType: "Projector", quantity: null }],
    });
    const afterBlank = await getMatrix2Snapshot(eventId);
    assert.equal(afterBlank.sessions[0]?.avRequirementsStructured[0]?.quantity, null, "blank quantity reloads as null");

    await updateMatrix2Session(eventId, session.id, {
      avRequirements: [{ avType: "Projector", quantity: 3 }],
    });
    const afterPositive = await getMatrix2Snapshot(eventId);
    assert.equal(afterPositive.sessions[0]?.avRequirementsStructured[0]?.quantity, 3, "positive quantity survives reload");
  } finally {
    await harness.cleanup();
  }
});
