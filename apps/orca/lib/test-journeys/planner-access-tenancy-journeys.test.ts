import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import {
  EventMemberRole,
  SeatingAssignment,
  TimelineStatus,
  UserRole,
} from "@prisma/client";
import {
  EventAccessError,
  assertEventAccessForUser,
  type EventAccessUser,
} from "@/lib/event-access";
import { createSessionFnbCatalogAssignment, deleteSessionFnbCatalogAssignment } from "@/lib/fnb-catalog";
import { getMatrix2Snapshot } from "@/lib/matrix2";
import {
  addMatrix2SessionSpeakerAssignment,
  removeMatrix2SessionSpeakerAssignment,
  updateMatrix2Session,
} from "@/lib/matrix2-session";
import { SeatingError, assignAttendeeToTable, getSeatingSnapshot, unassignAttendee } from "@/lib/seating";
import {
  createTimelineDependency,
  createTimelineItem,
  deleteTimelineItem,
  updateTimelineItem,
} from "@/src/server/services/timeline";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
  type PlannerRoleFixture,
  type PlannerRoleUser,
} from "@/lib/test-harness/planner-fixtures";

type AccessRoleName =
  | "owner"
  | "admin"
  | "member"
  | "viewer"
  | "eventViewer"
  | "unrelatedSameOrgMember"
  | "unrelatedOtherOrgMember"
  | "superAdmin";

const MATRIX_BASICS_PAYLOAD = {
  title: "Authorized Matrix Update",
  sessionType: "Workshop",
  status: "Confirmed",
  startTime: "09:30",
  endTime: "10:15",
  expectedAttendance: 45,
  roomSetupType: "Classroom",
  notes: "Access journey update.",
};

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed access journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

function roleEntries(roles: PlannerRoleFixture): Array<[AccessRoleName, PlannerRoleUser]> {
  return [
    ["owner", roles.owner],
    ["admin", roles.admin],
    ["member", roles.member],
    ["viewer", roles.viewer],
    ["eventViewer", roles.eventViewer],
    ["unrelatedSameOrgMember", roles.unrelatedSameOrgMember],
    ["unrelatedOtherOrgMember", roles.unrelatedOtherOrgMember],
    ["superAdmin", roles.superAdmin],
  ];
}

function withSelectedOrg(role: PlannerRoleUser, orgId: string): PlannerRoleUser {
  return {
    ...role,
    accessUser: {
      ...role.accessUser,
      orgId,
    },
  };
}

async function assertCanRead(eventId: string, user: EventAccessUser): Promise<void> {
  await assertEventAccessForUser(eventId, user, "read");
}

async function assertCanWrite(eventId: string, user: EventAccessUser): Promise<void> {
  await assertEventAccessForUser(eventId, user, "write");
}

async function assertDenied(
  work: () => Promise<unknown>,
  expectedReason: string,
): Promise<void> {
  await assert.rejects(
    work,
    (error) => error instanceof EventAccessError && error.reason === expectedReason,
  );
}

async function guardedMatrixUpdate(
  eventId: string,
  sessionId: string,
  user: EventAccessUser,
  payload: typeof MATRIX_BASICS_PAYLOAD & { roomId?: string; title?: string },
): Promise<void> {
  await assertCanWrite(eventId, user);
  await updateMatrix2Session(eventId, sessionId, payload);
}

async function guardedSpeakerAdd(
  eventId: string,
  sessionId: string,
  speakerId: string,
  user: EventAccessUser,
): Promise<void> {
  await assertCanWrite(eventId, user);
  await addMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId);
}

async function guardedSpeakerRemove(
  eventId: string,
  sessionId: string,
  speakerId: string,
  user: EventAccessUser,
): Promise<void> {
  await assertCanWrite(eventId, user);
  await removeMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId);
}

async function guardedFnbCreate(
  eventId: string,
  sessionId: string,
  user: EventAccessUser,
  body: { eventFnbCatalogItemId: string; quantity: number; serviceTiming?: string },
) {
  await assertCanWrite(eventId, user);
  return createSessionFnbCatalogAssignment(eventId, sessionId, body);
}

async function guardedFnbDelete(
  eventId: string,
  sessionId: string,
  assignmentId: string,
  user: EventAccessUser,
) {
  await assertCanWrite(eventId, user);
  return deleteSessionFnbCatalogAssignment(eventId, sessionId, assignmentId);
}

async function guardedSeatAssign(
  eventId: string,
  attendeeId: string,
  tableId: string,
  seatIndex: number,
  user: EventAccessUser,
  scope: { matrixRowId: string; seatingPlanId: string; requireScopedContext: true },
): Promise<SeatingAssignment> {
  await assertCanWrite(eventId, user);
  return assignAttendeeToTable(eventId, attendeeId, tableId, seatIndex, scope);
}

async function guardedSeatUnassign(
  eventId: string,
  attendeeId: string,
  user: EventAccessUser,
  scope: { matrixRowId: string; seatingPlanId: string; requireScopedContext: true },
): Promise<void> {
  await assertCanWrite(eventId, user);
  await unassignAttendee(eventId, attendeeId, scope);
}

async function matrixTitle(db: PlannerFixtureHarness["db"], sessionId: string): Promise<string | null> {
  const row = await db.matrixRow.findUnique({
    where: { id: sessionId },
    select: { sessionName: true },
  });
  return row?.sessionName ?? null;
}

async function countSpeakerAssignments(
  db: PlannerFixtureHarness["db"],
  sessionId: string,
  speakerId: string,
): Promise<number> {
  return db.sessionSpeakerAssignment.count({ where: { sessionId, speakerId } });
}

async function countFnbAssignments(
  db: PlannerFixtureHarness["db"],
  sessionId: string,
  eventFnbCatalogItemId: string,
): Promise<number> {
  return db.sessionFnbCatalogAssignment.count({ where: { sessionId, eventFnbCatalogItemId } });
}

function trackFnbServiceSideEffects(
  harness: PlannerFixtureHarness,
  assignment: { id: string; budgetLineItemId: string | null },
  budgetId: string | null,
): void {
  harness.ids.sessionFnbCatalogAssignmentIds.push(assignment.id);
  if (assignment.budgetLineItemId) harness.ids.budgetLineItemIds.push(assignment.budgetLineItemId);
  if (budgetId) harness.ids.budgetIds.push(budgetId);
}

test("Access journey: role matrix helper creates intended org/event relationships", async (t) => {
  const harness = createHarnessOrSkip(t, "access-role-matrix");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();

    assert.equal(roles.owner.user.role, UserRole.OWNER);
    assert.equal(roles.admin.user.role, UserRole.ADMIN);
    assert.equal(roles.member.user.role, UserRole.MEMBER);
    assert.equal(roles.viewer.user.role, UserRole.VIEWER);
    assert.equal(roles.eventViewer.eventMember?.eventRole, EventMemberRole.EVENT_VIEWER);
    assert.equal(roles.member.eventMember?.eventRole, EventMemberRole.EVENT_EDITOR);
    assert.equal(roles.viewer.eventMember?.eventRole, EventMemberRole.EVENT_EDITOR);

    for (const [name, role] of roleEntries(roles)) {
      assert.ok(role.user.id, `${name} has a user`);
      assert.ok(role.accessUser.id, `${name} has access user shape`);
      if (name === "unrelatedOtherOrgMember" || name === "superAdmin") {
        assert.notEqual(role.user.orgId, roles.organization.id, `${name} is outside protected org`);
      } else {
        assert.equal(role.user.orgId, roles.organization.id, `${name} is in protected org`);
        assert.equal(role.membership?.orgId, roles.organization.id, `${name} membership is in protected org`);
      }
    }

    assert.equal(roles.unrelatedSameOrgMember.eventMember, undefined);
    assert.equal(roles.unrelatedOtherOrgMember.eventMember, undefined);
    const accidentalMembers = await harness.db.eventMember.findMany({
      where: {
        eventId: roles.event.id,
        userId: {
          in: [
            roles.unrelatedSameOrgMember.user.id,
            roles.unrelatedOtherOrgMember.user.id,
          ],
        },
      },
      select: { id: true },
    });
    assert.equal(accidentalMembers.length, 0);
  } finally {
    await harness.cleanup();
  }
});

test("Access journey: event reads follow role and tenant boundaries", async (t) => {
  const harness = createHarnessOrSkip(t, "access-event-reads");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    await harness.createSessionRequirementTemplate({ eventId: roles.event.id });
    const protectedRoom = await harness.createRoom({ eventId: roles.event.id, name: "Protected Room" });
    await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: protectedRoom.id,
      sessionName: "Protected Session",
    });
    const unrelatedEvent = await harness.createEvent({
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: roles.owner.user.id,
      name: "Same Org Different Event",
    });
    const unrelatedRoom = await harness.createRoom({ eventId: unrelatedEvent.id, name: "Other Event Room" });
    await harness.createMatrixRow({
      eventId: unrelatedEvent.id,
      roomId: unrelatedRoom.id,
      sessionName: "Other Event Session",
    });

    const selectedOrgSuperAdmin = withSelectedOrg(roles.superAdmin, roles.organization.id);
    for (const role of [roles.owner, roles.admin, roles.member, roles.viewer, roles.eventViewer, selectedOrgSuperAdmin]) {
      await assertCanRead(roles.event.id, role.accessUser);
      const snapshot = await getMatrix2Snapshot(roles.event.id);
      assert.equal(snapshot.sessions.some((session) => session.title === "Protected Session"), true);
      assert.equal(snapshot.sessions.some((session) => session.title === "Other Event Session"), false);
    }

    await assertDenied(
      () => assertCanRead(roles.event.id, roles.unrelatedSameOrgMember.accessUser),
      "EVENT_MEMBERSHIP_REQUIRED",
    );
    await assertDenied(
      () => assertCanRead(roles.event.id, roles.unrelatedOtherOrgMember.accessUser),
      "EVENT_OUTSIDE_ACTIVE_ORG",
    );
    await assertDenied(
      () => assertCanRead(roles.event.id, roles.superAdmin.accessUser),
      "EVENT_OUTSIDE_ACTIVE_ORG",
    );
    await assertDenied(
      () => assertCanRead(unrelatedEvent.id, roles.member.accessUser),
      "EVENT_MEMBERSHIP_REQUIRED",
    );
    await assertDenied(
      () => assertCanRead(unrelatedEvent.id, roles.eventViewer.accessUser),
      "EVENT_MEMBERSHIP_REQUIRED",
    );
  } finally {
    await harness.cleanup();
  }
});

test("Access journey: Matrix 2 session basics writes are role-gated and denied writes do not persist", async (t) => {
  const harness = createHarnessOrSkip(t, "access-matrix-write");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    await harness.createSessionRequirementTemplate({ eventId: roles.event.id });
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Access Matrix Room" });
    const session = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Initial Matrix Session",
    });

    const allowed: Array<[string, PlannerRoleUser]> = [
      ["owner", roles.owner],
      ["admin", roles.admin],
      ["member", roles.member],
      ["viewer", roles.viewer],
      ["superAdmin", withSelectedOrg(roles.superAdmin, roles.organization.id)],
    ];
    for (const [name, role] of allowed) {
      const title = `Matrix updated by ${name}`;
      await guardedMatrixUpdate(roles.event.id, session.id, role.accessUser, {
        ...MATRIX_BASICS_PAYLOAD,
        title,
        roomId: room.id,
      });
      assert.equal(await matrixTitle(harness.db, session.id), title);
    }

    const stableTitle = await matrixTitle(harness.db, session.id);
    const denied: Array<[PlannerRoleUser, string]> = [
      [roles.eventViewer, "EVENT_EDITOR_ROLE_REQUIRED"],
      [roles.unrelatedSameOrgMember, "EVENT_MEMBERSHIP_REQUIRED"],
      [roles.unrelatedOtherOrgMember, "EVENT_OUTSIDE_ACTIVE_ORG"],
      [roles.superAdmin, "EVENT_OUTSIDE_ACTIVE_ORG"],
    ];
    for (const [role, reason] of denied) {
      await assertDenied(
        () => guardedMatrixUpdate(roles.event.id, session.id, role.accessUser, {
          ...MATRIX_BASICS_PAYLOAD,
          title: `Denied ${reason}`,
          roomId: room.id,
        }),
        reason,
      );
      assert.equal(await matrixTitle(harness.db, session.id), stableTitle);
    }
  } finally {
    await harness.cleanup();
  }
});

test("Access journey: quick drawer speaker and F&B mutations are role-gated and event-scoped", async (t) => {
  const harness = createHarnessOrSkip(t, "access-quick-drawer");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id });
    const session = await harness.createMatrixRow({ eventId: roles.event.id, roomId: room.id });
    const speaker = await harness.createSpeaker({ eventId: roles.event.id, name: "Protected Speaker" });
    const fnbItem = await harness.createEventFnbCatalogItem({
      eventId: roles.event.id,
      itemName: "Protected Coffee",
    });
    const otherOrg = await harness.createOrganization({
      name: `Fixture Other Org ${harness.runLabel}-cross-event-${randomUUID().slice(0, 8)}`,
    });
    const otherUser = await harness.createUser({ orgId: otherOrg.id, role: UserRole.OWNER });
    const otherEvent = await harness.createEvent({
      orgId: otherOrg.id,
      createdByUserId: otherUser.id,
      name: "Cross Event",
    });
    const otherSpeaker = await harness.createSpeaker({ eventId: otherEvent.id, name: "Other Event Speaker" });

    await assertDenied(
      () => guardedSpeakerAdd(roles.event.id, session.id, speaker.id, roles.eventViewer.accessUser),
      "EVENT_EDITOR_ROLE_REQUIRED",
    );
    assert.equal(await countSpeakerAssignments(harness.db, session.id, speaker.id), 0);
    await assertDenied(
      () => guardedSpeakerAdd(roles.event.id, session.id, speaker.id, roles.unrelatedSameOrgMember.accessUser),
      "EVENT_MEMBERSHIP_REQUIRED",
    );
    assert.equal(await countSpeakerAssignments(harness.db, session.id, speaker.id), 0);
    await assertDenied(
      () => guardedSpeakerAdd(roles.event.id, session.id, speaker.id, roles.unrelatedOtherOrgMember.accessUser),
      "EVENT_OUTSIDE_ACTIVE_ORG",
    );
    assert.equal(await countSpeakerAssignments(harness.db, session.id, speaker.id), 0);

    await guardedSpeakerAdd(roles.event.id, session.id, speaker.id, roles.member.accessUser);
    harness.ids.sessionSpeakerAssignments.push({ sessionId: session.id, speakerId: speaker.id });
    assert.equal(await countSpeakerAssignments(harness.db, session.id, speaker.id), 1);

    await assertDenied(
      () => guardedSpeakerRemove(roles.event.id, session.id, speaker.id, roles.eventViewer.accessUser),
      "EVENT_EDITOR_ROLE_REQUIRED",
    );
    assert.equal(await countSpeakerAssignments(harness.db, session.id, speaker.id), 1);

    await assert.rejects(
      () => guardedSpeakerAdd(roles.event.id, session.id, otherSpeaker.id, roles.member.accessUser),
      (error) => error instanceof Error && error.message.includes("Speaker not found"),
    );
    assert.equal(await countSpeakerAssignments(harness.db, session.id, otherSpeaker.id), 0);

    await guardedSpeakerRemove(roles.event.id, session.id, speaker.id, roles.member.accessUser);
    assert.equal(await countSpeakerAssignments(harness.db, session.id, speaker.id), 0);

    await assertDenied(
      () => guardedFnbCreate(roles.event.id, session.id, roles.eventViewer.accessUser, {
        eventFnbCatalogItemId: fnbItem.id,
        quantity: 10,
      }),
      "EVENT_EDITOR_ROLE_REQUIRED",
    );
    assert.equal(await countFnbAssignments(harness.db, session.id, fnbItem.id), 0);

    const assignment = await guardedFnbCreate(roles.event.id, session.id, roles.member.accessUser, {
      eventFnbCatalogItemId: fnbItem.id,
      quantity: 10,
      serviceTiming: "Before session",
    });
    const persistedAssignment = await harness.db.sessionFnbCatalogAssignment.findUnique({
      where: { id: assignment.id },
      select: { id: true, budgetLineItemId: true, budgetLineItem: { select: { budgetId: true } } },
    });
    assert.ok(persistedAssignment);
    trackFnbServiceSideEffects(harness, persistedAssignment, persistedAssignment.budgetLineItem?.budgetId ?? null);
    assert.equal(await countFnbAssignments(harness.db, session.id, fnbItem.id), 1);

    await assertDenied(
      () => guardedFnbDelete(roles.event.id, session.id, assignment.id, roles.eventViewer.accessUser),
      "EVENT_EDITOR_ROLE_REQUIRED",
    );
    assert.equal(await countFnbAssignments(harness.db, session.id, fnbItem.id), 1);

    await guardedFnbDelete(roles.event.id, session.id, assignment.id, roles.member.accessUser);
    assert.equal(await countFnbAssignments(harness.db, session.id, fnbItem.id), 0);
  } finally {
    await harness.cleanup();
  }
});

test("Access journey: seating exact-chair writes are role-gated and session scoped", async (t) => {
  const harness = createHarnessOrSkip(t, "access-seating");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Seating Room" });
    const session = await harness.createMatrixRow({ eventId: roles.event.id, roomId: room.id });
    const initialSnapshot = await getSeatingSnapshot(roles.event.id, { matrixRowId: session.id });
    assert.ok(initialSnapshot.seatingPlanId);
    harness.ids.seatingPlanIds.push(initialSnapshot.seatingPlanId);
    for (const table of initialSnapshot.tables) harness.ids.seatingTableIds.push(table.id);
    const table = await harness.createSeatingTable({
      eventId: roles.event.id,
      seatingPlanId: initialSnapshot.seatingPlanId,
      name: "Access Table",
      capacity: 4,
    });
    const attendee = await harness.createSeatingAttendee({
      eventId: roles.event.id,
      firstName: "Access",
      lastName: "Guest",
    });
    const scope = {
      matrixRowId: session.id,
      seatingPlanId: initialSnapshot.seatingPlanId,
      requireScopedContext: true as const,
    };

    for (const [role, reason] of [
      [roles.eventViewer, "EVENT_EDITOR_ROLE_REQUIRED"],
      [roles.unrelatedSameOrgMember, "EVENT_MEMBERSHIP_REQUIRED"],
      [roles.unrelatedOtherOrgMember, "EVENT_OUTSIDE_ACTIVE_ORG"],
    ] as Array<[PlannerRoleUser, string]>) {
      await assertDenied(
        () => guardedSeatAssign(roles.event.id, attendee.id, table.id, 2, role.accessUser, scope),
        reason,
      );
      const snapshot = await getSeatingSnapshot(roles.event.id, scope);
      assert.equal(snapshot.assignments.some((assignment) => assignment.attendeeId === attendee.id), false);
    }

    const assignment = await guardedSeatAssign(roles.event.id, attendee.id, table.id, 2, roles.member.accessUser, scope);
    harness.ids.seatingAssignmentIds.push(assignment.id);
    assert.equal(assignment.seatIndex, 2);

    await assertDenied(
      () => guardedSeatUnassign(roles.event.id, attendee.id, roles.eventViewer.accessUser, scope),
      "EVENT_EDITOR_ROLE_REQUIRED",
    );
    let snapshot = await getSeatingSnapshot(roles.event.id, scope);
    assert.equal(snapshot.assignments.some((entry) => entry.id === assignment.id), true);

    const otherSession = await harness.createMatrixRow({ eventId: roles.event.id, roomId: room.id });
    const otherSnapshot = await getSeatingSnapshot(roles.event.id, { matrixRowId: otherSession.id });
    assert.ok(otherSnapshot.seatingPlanId);
    const otherSeatingPlanId = otherSnapshot.seatingPlanId;
    harness.ids.seatingPlanIds.push(otherSeatingPlanId);
    for (const seedTable of otherSnapshot.tables) harness.ids.seatingTableIds.push(seedTable.id);
    await assert.rejects(
      () => guardedSeatAssign(roles.event.id, attendee.id, table.id, 1, roles.member.accessUser, {
        matrixRowId: otherSession.id,
        seatingPlanId: otherSeatingPlanId,
        requireScopedContext: true,
      }),
      (error) => error instanceof SeatingError && error.message.includes("active seating context"),
    );
    snapshot = await getSeatingSnapshot(roles.event.id, scope);
    assert.equal(snapshot.assignments.find((entry) => entry.id === assignment.id)?.seatIndex, 2);

    await guardedSeatUnassign(roles.event.id, attendee.id, roles.member.accessUser, scope);
    snapshot = await getSeatingSnapshot(roles.event.id, scope);
    assert.equal(snapshot.assignments.some((entry) => entry.id === assignment.id), false);
  } finally {
    await harness.cleanup();
  }
});

test("Access journey: timeline mutations enforce roles and cross-event boundaries", async (t) => {
  const harness = createHarnessOrSkip(t, "access-timeline");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: roles.owner.user.id,
      name: "Timeline Other Event",
    });
    const otherTimeline = await createTimelineItem(otherEvent.id, roles.owner.accessUser, {
      title: "Other event item",
    });
    harness.ids.timelineItemIds.push(otherTimeline.id);

    for (const [role, reason] of [
      [roles.eventViewer, "Event editor role required"],
      [roles.unrelatedSameOrgMember, "Event membership required"],
      [roles.unrelatedOtherOrgMember, "Event is outside the active organization scope"],
    ] as Array<[PlannerRoleUser, string]>) {
      const deniedTitle = `Denied ${reason}`;
      await assert.rejects(
        () => createTimelineItem(roles.event.id, role.accessUser, { title: deniedTitle }),
        (error) => error instanceof Error && error.message === reason,
      );
      const deniedCount: number = await harness.db.timelineItem.count({ where: { eventId: roles.event.id, title: deniedTitle } });
      assert.equal(deniedCount, 0);
    }

    const item = await createTimelineItem(roles.event.id, roles.member.accessUser, {
      title: "Protected timeline item",
      status: "NOT_STARTED",
    });
    harness.ids.timelineItemIds.push(item.id);
    const successor = await createTimelineItem(roles.event.id, roles.member.accessUser, {
      title: "Protected successor",
      status: "NOT_STARTED",
    });
    harness.ids.timelineItemIds.push(successor.id);

    await assert.rejects(
      () => updateTimelineItem(roles.event.id, item.id, roles.eventViewer.accessUser, { status: "COMPLETE" }),
      (error) => error instanceof Error && error.message === "Event editor role required",
    );
    assert.equal((await harness.db.timelineItem.findUnique({ where: { id: item.id } }))?.status, TimelineStatus.NOT_STARTED);

    const updated = await updateTimelineItem(roles.event.id, item.id, roles.member.accessUser, {
      status: "IN_PROGRESS",
      progress: 40,
    });
    assert.equal(updated.status, TimelineStatus.IN_PROGRESS);
    assert.equal(updated.progress, 40);

    await assert.rejects(
      () => createTimelineDependency(roles.event.id, roles.member.accessUser, {
        predecessorItemId: item.id,
        successorItemId: otherTimeline.id,
      }),
      (error) => error instanceof Error && error.message === "Both predecessor and successor items must belong to this event",
    );
    assert.equal(await harness.db.timelineDependency.count({ where: { eventId: roles.event.id } }), 0);

    await assert.rejects(
      () => createTimelineDependency(roles.event.id, roles.eventViewer.accessUser, {
        predecessorItemId: item.id,
        successorItemId: successor.id,
      }),
      (error) => error instanceof Error && error.message === "Event editor role required",
    );
    assert.equal(await harness.db.timelineDependency.count({ where: { eventId: roles.event.id } }), 0);

    const dependency = await createTimelineDependency(roles.event.id, roles.member.accessUser, {
      predecessorItemId: item.id,
      successorItemId: successor.id,
    });
    harness.ids.timelineDependencyIds.push(dependency.id);
    assert.ok(await harness.db.timelineDependency.findUnique({ where: { id: dependency.id } }));

    await assert.rejects(
      () => deleteTimelineItem(roles.event.id, successor.id, roles.eventViewer.accessUser),
      (error) => error instanceof Error && error.message === "Event editor role required",
    );
    assert.ok(await harness.db.timelineItem.findUnique({ where: { id: successor.id } }));
  } finally {
    await harness.cleanup();
  }
});

test("Access journey: high-risk quick drawer F&B routes are authenticated and event-authorized", () => {
  const collectionRoute = readFileSync(
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/route.ts",
    "utf8",
  );
  const itemRoute = readFileSync(
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/[assignmentId]/route.ts",
    "utf8",
  );

  assert.match(collectionRoute, /resolveRequestUser\(request\)/);
  assert.match(collectionRoute, /assertEventAccessForUser\(eventId, authResult\.user, "read"\)/);
  assert.match(collectionRoute, /assertEventAccessForUser\(eventId, authResult\.user, "write"\)/);
  assert.ok(
    collectionRoute.lastIndexOf("assertEventAccessForUser(eventId, authResult.user, \"write\")") <
      collectionRoute.lastIndexOf("createSessionFnbCatalogAssignment"),
  );

  assert.match(itemRoute, /resolveRequestUser\(request\)/);
  assert.match(itemRoute, /assertEventAccessForUser\(eventId, authResult\.user, "write"\)/);
  assert.ok(
    itemRoute.indexOf("assertEventAccessForUser(eventId, authResult.user, \"write\")") <
      itemRoute.lastIndexOf("updateSessionFnbCatalogAssignment"),
  );
  assert.ok(
    itemRoute.lastIndexOf("assertEventAccessForUser(eventId, authResult.user, \"write\")") <
      itemRoute.lastIndexOf("deleteSessionFnbCatalogAssignment"),
  );
});
