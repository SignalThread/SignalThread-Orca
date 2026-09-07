import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import {
  listRegistrationAgendaEntries,
  syncShowOpsAgendaToRegistration,
} from "@/lib/registration-agenda";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed integration tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `reg-agenda-${randomUUID().slice(0, 8)}` });
}

test("ShowOps handoff is official-only, idempotent, update-safe, and removes unmarked entries", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Main Stage" });
    const official = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Opening keynote",
    });
    const internal = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Crew rehearsal",
    });
    await harness.db.matrixRow.update({
      where: { id: official.id },
      data: {
        includeInOfficialAgenda: true,
        roomName: room.name,
        publicDescription: "Welcome to the event",
        notes: "[Session Type] Keynote\n[Status] Confirmed",
      },
    });
    const speaker = await harness.createSpeaker({
      eventId: roles.event.id,
      name: "Ada Speaker",
      bio: null,
    });
    await harness.createSessionSpeakerAssignment({ sessionId: official.id, speakerId: speaker.id });

    const first = await syncShowOpsAgendaToRegistration(roles.event.id, roles.owner.user.id);
    assert.deepEqual({ created: first.created, updated: first.updated, unchanged: first.unchanged, removed: first.removed }, { created: 1, updated: 0, unchanged: 0, removed: 0 });
    assert.equal(first.externalSyncSucceeded, false);
    assert.equal(first.adapter, "INTERNAL_REGISTRATION_STAGING");
    assert.equal(first.warnings.length, 1, "partial speaker profiles should transfer with a warning");

    const entries = await listRegistrationAgendaEntries(roles.event.id);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.sourceSessionId, official.id);
    assert.equal(entries[0]?.sourceKey, official.id);
    assert.equal(entries[0]?.title, "Opening keynote");
    assert.equal(entries[0]?.description, "Welcome to the event");
    assert.equal(entries[0]?.location, "Main Stage");
    assert.equal(entries[0]?.sessionType, "Keynote");
    assert.equal(entries[0]?.officialStatus, "Confirmed");
    assert.equal((entries[0]?.speakers as Array<{ id: string }>)[0]?.id, speaker.id);
    assert.notEqual(entries[0]?.sourceSessionId, internal.id);

    const second = await syncShowOpsAgendaToRegistration(roles.event.id, roles.owner.user.id);
    assert.deepEqual({ created: second.created, updated: second.updated, unchanged: second.unchanged }, { created: 0, updated: 0, unchanged: 1 });

    await harness.db.matrixRow.update({ where: { id: official.id }, data: { sessionName: "Opening keynote updated" } });
    const third = await syncShowOpsAgendaToRegistration(roles.event.id, roles.owner.user.id);
    assert.equal(third.updated, 1);
    assert.equal((await listRegistrationAgendaEntries(roles.event.id))[0]?.title, "Opening keynote updated");
    assert.equal(await harness.db.registrationAgendaEntry.count({ where: { eventId: roles.event.id } }), 1);

    await harness.db.matrixRow.update({ where: { id: official.id }, data: { includeInOfficialAgenda: false } });
    const fourth = await syncShowOpsAgendaToRegistration(roles.event.id, roles.owner.user.id);
    assert.equal(fourth.removed, 1);
    assert.deepEqual(await listRegistrationAgendaEntries(roles.event.id), []);
    const archived = await harness.db.registrationAgendaEntry.findFirstOrThrow({ where: { sourceSessionId: official.id } });
    assert.equal(archived.publicationStatus, "UNPUBLISHED");
    assert.ok(archived.archivedAt);
  } finally {
    await harness.cleanup();
  }
});

test("ShowOps handoff validates required fields and exposes permission-safe truthful UI states", () => {
  const service = readFileSync("lib/registration-agenda.ts", "utf8");
  const route = readFileSync("app/api/events/[eventId]/registration/agenda/showops-sync/route.ts", "utf8");
  const workspace = readFileSync("app/(shell)/events/[eventId]/registration/agenda/registration-agenda-workspace.tsx", "utf8");
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  assert.ok(service.includes('errors.push("Title is required")'));
  assert.ok(service.includes('errors.push("Start time is required")'));
  assert.ok(service.includes('errors.push("End time must be after start time")'));
  assert.ok(service.includes("includeInOfficialAgenda: true"));
  assert.ok(route.includes('assertEventAccessForUser(eventId, auth.user, "read")'));
  assert.ok(route.includes('assertEventAccessForUser(eventId, auth.user, "write")'));
  const postHandler = route.slice(route.indexOf("export async function POST"));
  assert.ok(postHandler.indexOf('assertEventAccessForUser(eventId, auth.user, "write")') < postHandler.indexOf("syncShowOpsAgendaToRegistration"));
  assert.ok(schema.includes("@@unique([eventId, source, sourceKey])"));
  assert.ok(workspace.includes("No external registration platform is connected or reported as synced"));
  assert.ok(workspace.includes("Importing…"));
  assert.ok(workspace.includes("ShowOps import failed"));
  assert.ok(workspace.includes("No Registration agenda entries yet"));
});
