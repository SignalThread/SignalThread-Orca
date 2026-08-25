import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  getSessionShowFlowWorkspace,
  listPublishedEventAgenda,
  previewSessionAgenda,
  publishSessionAgenda,
  replaceSessionShowFlow,
  SessionShowFlowError,
} from "@/lib/session-show-flow";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `show-flow-${randomUUID().slice(0, 8)}` });
}

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

test("show flow is ordered, concurrency-safe, recalculates offsets, and publishes a leakage-safe snapshot", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id });
    const session = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Opening session",
      startTime: time("09:00"),
      endTime: time("10:00"),
    });
    const speaker = await harness.createSpeaker({ eventId: roles.event.id, name: "Public Host" });

    const saved = await replaceSessionShowFlow(roles.event.id, session.id, [
      {
        timingMode: "OFFSET",
        offsetMin: 0,
        durationMin: 15,
        label: "Welcome",
        action: "Stand by, then walk on",
        owner: "Stage manager",
        department: "Production",
        speakerId: speaker.id,
        avNotes: "Confidence monitor",
        audioNotes: "Mic 1 live",
        lightingNotes: "Preset A",
        internalNotes: "Private cue detail",
        publicDescription: "Welcome and opening remarks",
        visibility: "PUBLIC",
      },
      {
        timingMode: "OFFSET",
        offsetMin: 15,
        durationMin: 15,
        label: "Internal reset",
        owner: "Producer",
        internalNotes: "Private reset notes",
        visibility: "INTERNAL",
      },
    ], {
      expectedRevision: 0,
      publicDescription: "Attendee-facing session summary",
      actorUserId: roles.owner.user.id,
    });

    assert.equal(saved.revision, 1);
    assert.equal(saved.items[0].effectiveStartTime, "09:00");
    assert.equal(saved.items[1].effectiveStartTime, "09:15");
    assert.deepEqual(saved.conflicts, []);

    await assert.rejects(
      () => replaceSessionShowFlow(roles.event.id, session.id, saved.items, {
        expectedRevision: 0,
        actorUserId: roles.owner.user.id,
      }),
      (error: unknown) => error instanceof SessionShowFlowError
        && error.status === 409
        && error.code === "STALE_SHOW_FLOW_REVISION",
    );

    await harness.db.matrixRow.update({
      where: { id: session.id },
      data: { startTime: time("10:00"), endTime: time("11:00") },
    });
    const recalculated = await getSessionShowFlowWorkspace(roles.event.id, session.id);
    assert.equal(recalculated.items[0].effectiveStartTime, "10:00");
    assert.equal(recalculated.items[1].effectiveStartTime, "10:15");

    const preview = await previewSessionAgenda(roles.event.id, session.id);
    assert.equal(preview.preview.cues.length, 1);
    const serializedPreview = JSON.stringify(preview.preview);
    for (const privateValue of ["Private cue detail", "Private reset notes", "Stage manager", "Production", "Confidence monitor", "Mic 1 live", "Preset A"]) {
      assert.equal(serializedPreview.includes(privateValue), false, `${privateValue} must not leak`);
    }

    const publication = await publishSessionAgenda(roles.event.id, session.id, {
      expectedRevision: 1,
      actorUserId: roles.owner.user.id,
    });
    assert.equal(publication.version, 1);
    assert.equal(publication.preview.cues.length, 1);

    const publicAgenda = await listPublishedEventAgenda(roles.event.id);
    assert.equal(publicAgenda.length, 1);
    assert.equal(JSON.stringify(publicAgenda), JSON.stringify(publicAgenda).replace(/Private cue detail|Stage manager|Confidence monitor/g, ""));

    const staff = await harness.createEventPerson({ eventId: roles.event.id });
    await harness.createSessionSpeakerAssignment({ sessionId: session.id, speakerId: speaker.id });
    await harness.createSessionStaffAssignment({ sessionId: session.id, personId: staff.id });
    const overlapping = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Overlapping production",
      startTime: time("10:30"),
      endTime: time("11:15"),
    });
    await harness.createSessionSpeakerAssignment({ sessionId: overlapping.id, speakerId: speaker.id });
    await harness.createSessionStaffAssignment({ sessionId: overlapping.id, personId: staff.id });
    const resourceConflictCodes = new Set((await getSessionShowFlowWorkspace(roles.event.id, session.id)).conflicts.map((entry) => entry.code));
    assert.equal(resourceConflictCodes.has("ROOM_CONFLICT"), true);
    assert.equal(resourceConflictCodes.has("SPEAKER_CONFLICT"), true);
    assert.equal(resourceConflictCodes.has("STAFF_CONFLICT"), true);

    const changed = await replaceSessionShowFlow(roles.event.id, session.id, recalculated.items.map((item) => (
      item.label === "Welcome" ? { ...item, publicDescription: "Updated attendee copy" } : item
    )), {
      expectedRevision: 1,
      actorUserId: roles.owner.user.id,
    });
    assert.equal(changed.revision, 2);
    assert.equal(changed.publication.hasUnpublishedChanges, true);

    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      createdByUserId: roles.owner.user.id,
      name: "Other event",
    });
    const otherSpeaker = await harness.createSpeaker({ eventId: otherEvent.id });
    await assert.rejects(
      () => replaceSessionShowFlow(roles.event.id, session.id, [{
        timingMode: "OFFSET",
        offsetMin: 0,
        durationMin: 5,
        label: "Wrong event talent",
        speakerId: otherSpeaker.id,
      }], { expectedRevision: 2, actorUserId: roles.owner.user.id }),
      (error: unknown) => error instanceof SessionShowFlowError && error.code === "CROSS_EVENT_SPEAKER",
    );

    assert.equal(await harness.db.sessionAgendaPublication.count({ where: { eventId: roles.event.id, sessionId: session.id } }), 1);
    assert.equal(await harness.db.eventActivity.count({
      where: { eventId: roles.event.id, entityType: { in: ["SessionShowFlow", "SessionAgendaPublication"] } },
    }), 3);
  } finally {
    await harness.cleanup();
  }
});
