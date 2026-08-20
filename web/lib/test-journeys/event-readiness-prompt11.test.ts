import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { getEventReadinessSnapshot } from "@/lib/event-readiness";
import { getEventCommandCenter } from "@/src/server/services/event-command-center";
import { createPlannerFixtureHarness, hasPlannerTestDatabaseUrl, type PlannerFixtureHarness } from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) { t.skip("DATABASE_URL is not configured for DB-backed journey tests."); return null; }
  return createPlannerFixtureHarness({ runLabel: `readiness-${randomUUID().slice(0, 8)}` });
}
function time(value: string) { return new Date(`1970-01-01T${value}:00.000Z`); }

test("readiness reconciles canonical sessions, speakers, audited dispositions and staffing conflicts", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id });
    const first = await harness.createMatrixRow({ eventId: roles.event.id, roomId: room.id, sessionName: "Opening keynote", startTime: time("09:00"), endTime: time("10:00") });
    const second = await harness.createMatrixRow({ eventId: roles.event.id, roomId: room.id, sessionName: "Operations", startTime: time("09:30"), endTime: time("10:30") });
    const person = await harness.createEventPerson({ eventId: roles.event.id, name: "Shared producer" });
    await harness.createSessionStaffAssignment({ sessionId: first.id, personId: person.id, role: "Producer" });
    await harness.createSessionStaffAssignment({ sessionId: second.id, personId: person.id, role: "Producer" });
    const speaker = await harness.createSpeaker({ eventId: roles.event.id, name: "Incomplete speaker" });
    await harness.createSessionSpeakerAssignment({ sessionId: first.id, speakerId: speaker.id });
    const template = await harness.createSessionRequirementTemplate({ eventId: roles.event.id });
    const suppliesSection = await harness.createSessionRequirementSection({ templateId: template.id, key: "supplies", label: "Supplies", sortOrder: 1 });
    const suppliesItem = await harness.createSessionRequirementItem({ sectionId: suppliesSection.id, key: "lectern", label: "Lectern" });
    await harness.createSessionRequirementSelection({ sessionId: first.id, itemId: suppliesItem.id, quantity: 1 });
    await harness.db.sessionFnbRequirement.create({ data: { eventId: roles.event.id, sessionId: second.id, kind: "DIETARY", code: "NO_FOOD_SERVICE", disposition: "NOT_NEEDED", dispositionReason: "No food service in this session", dispositionActorUserId: roles.owner.user.id, dispositionAt: new Date("2026-08-11T12:00:00Z") } });

    const asOf = new Date("2026-08-11T15:00:00Z");
    const snapshot = await getEventReadinessSnapshot(roles.event.id, asOf);
    assert.equal(snapshot.dataAsOf, asOf.toISOString());
    assert.equal(snapshot.summary.total, 2);
    assert.equal(snapshot.staffing.conflicts.length, 2);
    assert.equal(snapshot.speakers.total, 1);
    assert.equal(snapshot.speakers.needsAction, 1);
    const secondFnb = snapshot.sessions.find((row) => row.id === second.id)?.modules.find((module) => module.id === "fnb");
    assert.equal(secondFnb?.state, "not_needed");
    assert.equal(secondFnb?.reasons[0]?.code, "FNB_NOT_NEEDED_AUDITED");
    for (const row of snapshot.sessions) for (const readinessModule of row.modules) {
      assert.ok(readinessModule.href.startsWith(`/events/${roles.event.id}/`));
      assert.ok(readinessModule.reasons.length > 0);
      assert.ok(readinessModule.reasons.every((reason) => reason.code && reason.href));
    }

    const commandCenter = await getEventCommandCenter(roles.event.id, roles.owner.accessUser);
    assert.deepEqual(commandCenter.event.readiness.summary, snapshot.summary);
    assert.equal(commandCenter.event.readiness.staffing.conflicts.length, snapshot.staffing.conflicts.length);
    assert.equal(commandCenter.event.executiveBriefing.event.id, roles.event.id);
    assert.equal(commandCenter.event.executiveBriefing.dataAsOf, commandCenter.event.readiness.dataAsOf);
    assert.ok(commandCenter.event.executiveBriefing.facts.every((fact) => fact.evidence.href.startsWith(`/events/${roles.event.id}/`)));
    assert.ok(commandCenter.event.executiveBriefing.recommendations.every((recommendation) => recommendation.actionMode === "editable"));
    const viewerCommandCenter = await getEventCommandCenter(roles.event.id, roles.eventViewer.accessUser);
    assert.ok(viewerCommandCenter.event.executiveBriefing.recommendations.every((recommendation) => recommendation.actionMode === "view_only"));
    await assert.rejects(() => getEventCommandCenter(roles.event.id, roles.unrelatedOtherOrgMember.accessUser), (error: unknown) => typeof error === "object" && error !== null && "status" in error && error.status === 403);
    const otherEvent = await harness.createEvent({ orgId: roles.organization.id, createdByUserId: roles.owner.user.id, name: "Other event" });
    await harness.createMatrixRow({ eventId: otherEvent.id, sessionName: "CROSS EVENT SECRET" });
    assert.doesNotMatch(JSON.stringify(await getEventReadinessSnapshot(roles.event.id, asOf)), /CROSS EVENT SECRET/);
    assert.doesNotMatch(JSON.stringify(commandCenter.event.executiveBriefing), /CROSS EVENT SECRET/);
  } finally { await harness.cleanup(); }
});
