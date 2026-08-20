import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventAccessError } from "@/lib/event-access";
import { EventTerminologyError, getEventTerminology, updateEventTerminology } from "@/lib/orca-terminology";
import {
  EventIntegrationError,
  linkExternalIdentity,
  normalizeCapabilities,
  upsertEventIntegrationConnection,
} from "@/src/server/services/event-integration";
import { createPlannerFixtureHarness, hasPlannerTestDatabaseUrl, type PlannerFixtureHarness } from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) { t.skip("DATABASE_URL is required"); return null; }
  return createPlannerFixtureHarness({ runLabel: `prompt14-${randomUUID().slice(0, 8)}` });
}

test("event terminology inheritance, CAS, audit, permissions and approved DB constraint persist", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    await harness.db.organization.update({ where: { id: roles.organization.id }, data: { runOfShowTerm: "Matrix" } });
    const initial = await getEventTerminology(roles.event.id);
    assert.equal(initial.terms.runOfShow, "Matrix");
    const updated = await updateEventTerminology(roles.event.id, roles.owner.accessUser, {
      agenda: "Show Flow", runOfShow: "Run of Show", matrix: null, showFlow: "Agenda", expectedUpdatedAt: initial.updatedAt,
    });
    assert.deepEqual(updated.terms, { agenda: "Show Flow", runOfShow: "Run of Show", matrix: "Matrix", showFlow: "Agenda" });
    await assert.rejects(
      () => updateEventTerminology(roles.event.id, roles.owner.accessUser, { agenda: null, runOfShow: null, matrix: null, showFlow: null, expectedUpdatedAt: initial.updatedAt }),
      (error: unknown) => error instanceof EventTerminologyError && error.status === 409 && error.code === "VERSION_CONFLICT",
    );
    await assert.rejects(
      () => updateEventTerminology(roles.event.id, roles.eventViewer.accessUser, { agenda: null, runOfShow: null, matrix: null, showFlow: null, expectedUpdatedAt: updated.updatedAt }),
      (error: unknown) => error instanceof EventAccessError && error.status === 403,
    );
    await assert.rejects(
      () => harness.db.event.update({ where: { id: roles.event.id }, data: { agendaTerm: "Unapproved schedule" } }),
      /constraint|agendaTerm/i,
    );
    const activity = await harness.db.eventActivity.findFirst({ where: { eventId: roles.event.id, entityType: "EventTerminology" } });
    assert.equal(activity?.message, "Updated event display terminology");
    assert.doesNotMatch(JSON.stringify(activity?.changes), /token|secret|credential/i);
  } finally { await harness.cleanup(); }
});

test("integration boundaries validate input and reject cross-event identities", async (t) => {
  assert.throws(() => normalizeCapabilities({ canPullAttendees: "yes" }), (error: unknown) => error instanceof EventIntegrationError && error.code === "INVALID_CAPABILITIES");
  assert.throws(() => normalizeCapabilities({ inventedCapability: true }), (error: unknown) => error instanceof EventIntegrationError && error.code === "INVALID_CAPABILITIES");
  const harness = harnessOrSkip(t);
  if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    const otherEvent = await harness.createEvent({ orgId: roles.organization.id, clientId: roles.client.id, createdByUserId: roles.owner.user.id, name: "Other event" });
    const person = await harness.db.eventDirectoryPerson.create({ data: { orgId: roles.organization.id, clientId: roles.client.id, eventId: roles.event.id, displayName: "Scoped Person", createdByUserId: roles.owner.user.id } });
    const otherPerson = await harness.db.eventDirectoryPerson.create({ data: { orgId: roles.organization.id, clientId: roles.client.id, eventId: otherEvent.id, displayName: "Other Person", createdByUserId: roles.owner.user.id } });
    const first = await upsertEventIntegrationConnection({ eventId: roles.event.id, user: roles.owner.accessUser, provider: " Generic.Provider ", capabilities: { canPullAttendees: true } });
    const replay = await upsertEventIntegrationConnection({ eventId: roles.event.id, user: roles.owner.accessUser, provider: "generic.provider", capabilities: { canPullAttendees: true } });
    assert.equal(first.id, replay.id);
    await assert.rejects(
      () => upsertEventIntegrationConnection({ eventId: roles.event.id, user: roles.owner.accessUser, provider: "bad provider!" }),
      (error: unknown) => error instanceof EventIntegrationError && error.code === "INVALID_PROVIDER",
    );
    const linked = await linkExternalIdentity({ eventId: roles.event.id, user: roles.owner.accessUser, directoryPersonId: person.id, provider: "generic.provider", externalObjectType: "person", externalObjectId: "external-1" });
    const linkedAgain = await linkExternalIdentity({ eventId: roles.event.id, user: roles.owner.accessUser, directoryPersonId: person.id, provider: "generic.provider", externalObjectType: "person", externalObjectId: "external-1" });
    assert.equal(linked.created, true);
    assert.deepEqual(linkedAgain, { created: false, id: linked.id });
    await assert.rejects(
      () => linkExternalIdentity({ eventId: roles.event.id, user: roles.owner.accessUser, directoryPersonId: otherPerson.id, provider: "generic.provider", externalObjectType: "person", externalObjectId: "external-2" }),
      (error: unknown) => error instanceof EventIntegrationError && error.status === 404 && error.code === "DIRECTORY_PERSON_NOT_FOUND",
    );
    await assert.rejects(
      () => upsertEventIntegrationConnection({ eventId: roles.event.id, user: roles.unrelatedOtherOrgMember.accessUser, provider: "generic.provider" }),
      (error: unknown) => error instanceof EventAccessError && error.status === 403,
    );
  } finally { await harness.cleanup(); }
});
