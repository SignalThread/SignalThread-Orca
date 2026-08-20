import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventPersonRole, TimelineDependencyType, TimelineStatus } from "@prisma/client";
import { getMatrix2Snapshot } from "@/lib/matrix2";
import { removeMatrix2SessionSpeakerAssignment, updateMatrix2Session } from "@/lib/matrix2-session";
import { assignAttendeeToTable, getSeatingSnapshot } from "@/lib/seating";
import {
  createTimelineDependency,
  createTimelineItem,
  listTimelineItems,
  updateTimelineItem,
} from "@/src/server/services/timeline";
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

function timePart(value: Date | null): string | null {
  if (!value) return null;
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

test("Planner journey: event creation produces workspace-ready event data and cleans up", async (t) => {
  const harness = createHarnessOrSkip(t, "journey-event-create");
  if (!harness) return;

  let created: { eventId: string; ownerUserId: string; orgId: string } | null = null;

  try {
    const roles = await harness.createRoleAccessFixture();
    created = {
      eventId: roles.event.id,
      ownerUserId: roles.owner.user.id,
      orgId: roles.organization.id,
    };

    const persistedEvent = await harness.db.event.findUnique({
      where: { id: roles.event.id },
      select: {
        id: true,
        orgId: true,
        clientId: true,
        createdByUserId: true,
        name: true,
      },
    });
    assert.deepEqual(persistedEvent, {
      id: roles.event.id,
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: roles.owner.user.id,
      name: roles.event.name,
    });

    const ownerMembership = await harness.db.membership.findFirst({
      where: { orgId: roles.organization.id, userId: roles.owner.user.id },
      select: { id: true },
    });
    assert.ok(ownerMembership);

    await harness.createSessionRequirementTemplate({ eventId: roles.event.id });
    const snapshot = await getMatrix2Snapshot(roles.event.id);
    assert.equal(snapshot.event.id, roles.event.id);
    assert.equal(snapshot.event.name, roles.event.name);
    assert.ok(snapshot.requirementTemplate.id);
    assert.equal(snapshot.sessions.length, 0);
  } finally {
    await harness.cleanup();
  }

  assert.ok(created);
  const [event, owner, org] = await Promise.all([
    harness.db.event.findUnique({ where: { id: created.eventId }, select: { id: true } }),
    harness.db.user.findUnique({ where: { id: created.ownerUserId }, select: { id: true } }),
    harness.db.organization.findUnique({ where: { id: created.orgId }, select: { id: true } }),
  ]);
  assert.equal(event, null);
  assert.equal(owner, null);
  assert.equal(org, null);
});

test("Planner journey: Run of Show session basics persist through Matrix 2 snapshot reread", async (t) => {
  const harness = createHarnessOrSkip(t, "journey-ros-basics");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const originalRoom = await harness.createRoom({ eventId: roles.event.id, name: "Original Ballroom" });
    const updatedRoom = await harness.createRoom({ eventId: roles.event.id, name: "Grand Ballroom", capacity: 420 });
    const session = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: originalRoom.id,
      sessionName: "Draft Session",
    });

    await updateMatrix2Session(roles.event.id, session.id, {
      title: "Executive Keynote",
      sessionType: "Keynote",
      status: "Confirmed",
      roomId: updatedRoom.id,
      startTime: "10:15",
      endTime: "11:05",
      expectedAttendance: 275,
      roomSetupType: "Theater",
      notes: "Doors open at 10:00.",
    });

    const [persistedRow, snapshot] = await Promise.all([
      harness.db.matrixRow.findUnique({
        where: { id: session.id },
        select: {
          id: true,
          eventId: true,
          roomId: true,
          roomName: true,
          sessionName: true,
          startTime: true,
          endTime: true,
          setupType: true,
          attendance: true,
        },
      }),
      getMatrix2Snapshot(roles.event.id),
    ]);

    assert.ok(persistedRow);
    assert.equal(persistedRow.eventId, roles.event.id);
    assert.equal(persistedRow.roomId, updatedRoom.id);
    assert.equal(persistedRow.roomName, updatedRoom.name);
    assert.equal(persistedRow.sessionName, "Executive Keynote");
    assert.equal(timePart(persistedRow.startTime), "10:15");
    assert.equal(timePart(persistedRow.endTime), "11:05");
    assert.equal(persistedRow.setupType, "Theater");
    assert.equal(persistedRow.attendance, 275);

    const snapshotSession = snapshot.sessions.find((entry) => entry.id === session.id);
    assert.ok(snapshotSession);
    assert.equal(snapshotSession.title, "Executive Keynote");
    assert.equal(snapshotSession.sessionType, "Keynote");
    assert.equal(snapshotSession.status, "Confirmed");
    assert.equal(snapshotSession.roomId, updatedRoom.id);
    assert.equal(snapshotSession.roomName, updatedRoom.name);
    assert.equal(snapshotSession.startTime, "10:15");
    assert.equal(snapshotSession.endTime, "11:05");
    assert.equal(snapshotSession.expectedAttendance, 275);
    assert.equal(snapshotSession.roomSetup, "Theater");
  } finally {
    await harness.cleanup();
  }
});

test("Planner journey: session quick drawer data persists and speaker removal is reflected", async (t) => {
  const harness = createHarnessOrSkip(t, "journey-quick-drawer");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Breakout A" });
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
    await harness.createSessionStaffAssignment({
      sessionId: session.id,
      personId: staff.id,
      role: "Stage Manager",
    });
    const template = await harness.createSessionRequirementTemplate({ eventId: roles.event.id });
    const avSection = await harness.createSessionRequirementSection({
      templateId: template.id,
      key: "av",
      label: "AV",
    });
    const projector = await harness.createSessionRequirementItem({
      sectionId: avSection.id,
      key: "projector",
      label: "Projector",
    });
    const fnbItem = await harness.createEventFnbCatalogItem({
      eventId: roles.event.id,
      itemName: "Coffee Service",
      category: "Beverage",
    });
    await harness.createSessionFnbCatalogAssignment({
      sessionId: session.id,
      eventFnbCatalogItemId: fnbItem.id,
      quantity: 80,
    });

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
      foodService: {
        serviceType: "Coffee Break",
        serviceStyle: "Station",
        headcount: 80,
      },
      foodAndBeverage: ["Coffee Service"],
      staffAssignments: [{
        personId: staff.id,
        name: staff.name,
        personRole: "staff",
        assignmentRole: "Stage Manager",
      }],
      requirementSelections: [{ itemId: projector.id, quantity: 1 }],
      notes: "Confirm screen height before doors.",
    });

    const firstSnapshot = await getMatrix2Snapshot(roles.event.id);
    const firstSession = firstSnapshot.sessions.find((entry) => entry.id === session.id);
    assert.ok(firstSession);
    assert.deepEqual(firstSession.speakerAssignments.map((entry) => entry.speakerId), [speaker.id]);
    assert.equal(firstSession.avRequirementsStructured[0]?.avType, "Projector");
    assert.equal(firstSession.avRequirementsStructured[0]?.quantity, 1);
    assert.equal(firstSession.foodAndBeverage.includes("Coffee Service"), true);
    assert.equal(firstSession.staffAssignments[0]?.personId, staff.id);
    assert.equal(firstSession.staffAssignments[0]?.assignmentRole, "Stage Manager");
    assert.deepEqual(firstSession.requirementSelections, [{
      itemId: projector.id,
      quantity: 1,
      linkedBudgetLineItem: null,
    }]);

    const catalogAssignment = await harness.db.sessionFnbCatalogAssignment.findFirst({
      where: {
        sessionId: session.id,
        eventFnbCatalogItemId: fnbItem.id,
      },
      select: { id: true, quantity: true, catalogItem: { select: { itemName: true } } },
    });
    assert.deepEqual(catalogAssignment, {
      id: catalogAssignment?.id,
      quantity: 80,
      catalogItem: { itemName: "Coffee Service" },
    });

    await removeMatrix2SessionSpeakerAssignment(roles.event.id, session.id, speaker.id);

    const secondSnapshot = await getMatrix2Snapshot(roles.event.id);
    const secondSession = secondSnapshot.sessions.find((entry) => entry.id === session.id);
    assert.ok(secondSession);
    assert.equal(secondSession.speakerAssignments.some((entry) => entry.speakerId === speaker.id), false);
    assert.equal(secondSession.avRequirementsStructured[0]?.avType, "Projector");
    assert.equal(secondSession.staffAssignments[0]?.personId, staff.id);
  } finally {
    await harness.cleanup();
  }
});

test("Planner journey: Room Set seating assigns an attendee to an exact session-scoped chair", async (t) => {
  const harness = createHarnessOrSkip(t, "journey-room-set-seating");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Room Set Hall" });
    const session = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Room Set Workshop",
    });
    const initialSnapshot = await getSeatingSnapshot(roles.event.id, { matrixRowId: session.id });
    assert.ok(initialSnapshot.seatingPlanId);
    harness.ids.seatingPlanIds.push(initialSnapshot.seatingPlanId);
    for (const table of initialSnapshot.tables) {
      harness.ids.seatingTableIds.push(table.id);
    }

    const table = await harness.createSeatingTable({
      eventId: roles.event.id,
      seatingPlanId: initialSnapshot.seatingPlanId,
      name: "Workshop Table 1",
      capacity: 6,
    });
    const attendee = await harness.createSeatingAttendee({
      eventId: roles.event.id,
      firstName: "Jordan",
      lastName: "Patel",
      email: "jordan.patel@planner.test",
    });

    const assignment = await assignAttendeeToTable(
      roles.event.id,
      attendee.id,
      table.id,
      3,
      {
        matrixRowId: session.id,
        seatingPlanId: initialSnapshot.seatingPlanId,
        requireScopedContext: true,
      },
    );
    harness.ids.seatingAssignmentIds.push(assignment.id);
    assert.equal(assignment.seatIndex, 3);
    assert.equal(assignment.seatingPlanId, initialSnapshot.seatingPlanId);

    const reloadedSnapshot = await getSeatingSnapshot(roles.event.id, {
      matrixRowId: session.id,
      seatingPlanId: initialSnapshot.seatingPlanId,
    });
    const reloadedAssignment = reloadedSnapshot.assignments.find((entry) => entry.id === assignment.id);
    assert.ok(reloadedAssignment);
    assert.equal(reloadedAssignment.eventId, roles.event.id);
    assert.equal(reloadedAssignment.tableId, table.id);
    assert.equal(reloadedAssignment.attendeeId, attendee.id);
    assert.equal(reloadedAssignment.seatingPlanId, initialSnapshot.seatingPlanId);
    assert.equal(reloadedAssignment.seatIndex, 3);
    assert.equal(reloadedSnapshot.tables.find((entry) => entry.id === table.id)?.assignedCount, 1);

    const eventWideSnapshot = await getSeatingSnapshot(roles.event.id);
    assert.equal(eventWideSnapshot.assignments.some((entry) => entry.id === assignment.id), false);
  } finally {
    await harness.cleanup();
  }
});

test("Planner journey: timeline item lifecycle and dependency persist through service reread", async (t) => {
  const harness = createHarnessOrSkip(t, "journey-timeline");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const ownerUser = roles.owner.accessUser;
    await harness.createEventMember({ eventId: roles.event.id, userId: roles.owner.user.id });

    const kickoff = await createTimelineItem(roles.event.id, ownerUser, {
      title: "Finalize production schedule",
      status: "NOT_STARTED",
      priority: "HIGH",
      ownerUserId: roles.owner.user.id,
      startDate: "2026-01-02",
      endDate: "2026-01-03",
    });
    harness.ids.timelineItemIds.push(kickoff.id);

    const updatedKickoff = await updateTimelineItem(roles.event.id, kickoff.id, ownerUser, {
      status: "IN_PROGRESS",
      progress: 50,
    });
    assert.equal(updatedKickoff.status, TimelineStatus.IN_PROGRESS);
    assert.equal(updatedKickoff.progress, 50);

    const rehearsal = await createTimelineItem(roles.event.id, ownerUser, {
      title: "Run show rehearsal",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      ownerUserId: roles.member.user.id,
      startDate: "2026-01-04",
      endDate: "2026-01-04",
    });
    harness.ids.timelineItemIds.push(rehearsal.id);

    const dependency = await createTimelineDependency(roles.event.id, ownerUser, {
      predecessorItemId: kickoff.id,
      successorItemId: rehearsal.id,
      type: "FINISH_TO_START",
    });
    harness.ids.timelineDependencyIds.push(dependency.id);

    const reloadedItems = await listTimelineItems(roles.event.id, ownerUser, { orderBy: "sortOrder" });
    const reloadedKickoff = reloadedItems.find((entry) => entry.id === kickoff.id);
    const reloadedRehearsal = reloadedItems.find((entry) => entry.id === rehearsal.id);
    assert.ok(reloadedKickoff);
    assert.ok(reloadedRehearsal);
    assert.equal(reloadedKickoff.status, TimelineStatus.IN_PROGRESS);
    assert.equal(reloadedKickoff.progress, 50);
    assert.equal(reloadedRehearsal.ownerUserId, roles.member.user.id);

    const reloadedDependency = await harness.db.timelineDependency.findFirst({
      where: {
        id: dependency.id,
        eventId: roles.event.id,
        predecessorItemId: kickoff.id,
        successorItemId: rehearsal.id,
      },
      select: {
        id: true,
        type: true,
      },
    });
    assert.deepEqual(reloadedDependency, {
      id: dependency.id,
      type: TimelineDependencyType.FINISH_TO_START,
    });
  } finally {
    await harness.cleanup();
  }
});
