import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { DirectoryActionError, getEventDirectoryActionContext, runEventDirectoryAction } from "@/src/server/services/event-directory-actions";
import { createPlannerFixtureHarness, hasPlannerTestDatabaseUrl, type PlannerFixtureHarness } from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) { t.skip("DATABASE_URL is not configured"); return null; }
  return createPlannerFixtureHarness({ runLabel: `directory-actions-${randomUUID().slice(0, 8)}` });
}

test("Event Directory action context uses canonical attendee and speaker records", async (t) => {
  const harness = harnessOrSkip(t); if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    const person = await harness.db.eventDirectoryPerson.create({
      data: { orgId: roles.organization.id, eventId: roles.event.id, displayName: "Casey Attendee", email: "casey@example.test", normalizedEmail: "casey@example.test" },
    });
    const attendee = await harness.db.eventAttendee.create({
      data: { eventId: roles.event.id, directoryPersonId: person.id, registrationStatus: "REGISTERED", attendanceStatus: "CONFIRMED", createdByUserId: roles.owner.user.id },
    });
    const speaker = await harness.createSpeaker({ eventId: roles.event.id, name: "Casey Attendee", bio: "Speaker bio" });
    await harness.db.speaker.update({ where: { id: speaker.id }, data: { headshotUrl: "https://example.test/headshot.jpg" } });
    await harness.db.eventDirectoryModuleLink.create({ data: { eventId: roles.event.id, personId: person.id, module: "SPEAKER", moduleRecordId: speaker.id } });
    const session = await harness.createMatrixRow({ eventId: roles.event.id, sessionName: "Directory session" });
    await harness.createSessionSpeakerAssignment({ sessionId: session.id, speakerId: speaker.id });

    const context = await getEventDirectoryActionContext({ eventId: roles.event.id, personId: person.id, user: roles.owner.user });
    assert.equal(context.attendee?.id, attendee.id);
    assert.equal(context.attendee?.actions.cancel.available, true);
    assert.equal(context.attendee?.actions.transfer.available, false);
    assert.match(context.attendee?.actions.transfer.reason ?? "", /No write-capable Registration/);
    assert.equal(context.speaker?.id, speaker.id);
    assert.equal(context.speaker?.bio, "Speaker bio");
    assert.equal(context.speaker?.headshotUrl, "https://example.test/headshot.jpg");
    assert.equal(context.speaker?.sessions[0]?.id, session.id);
    assert.equal(context.speaker?.portalAccess.available, false);

    await runEventDirectoryAction({ eventId: roles.event.id, personId: person.id, user: roles.owner.user, action: "assign-room", hotelName: "Orca Hotel", roomNumber: "402" });
    const housed = await harness.db.eventAttendee.findUniqueOrThrow({ where: { id: attendee.id } });
    assert.equal(housed.housingHotelName, "Orca Hotel");
    assert.equal(housed.housingRoomNumber, "402");

    await runEventDirectoryAction({ eventId: roles.event.id, personId: person.id, user: roles.owner.user, action: "cancel-registration" });
    assert.equal((await harness.db.eventAttendee.findUniqueOrThrow({ where: { id: attendee.id } })).registrationStatus, "CANCELLED");
    await assert.rejects(
      () => runEventDirectoryAction({ eventId: roles.event.id, personId: person.id, user: roles.owner.user, action: "cancel-registration" }),
      (error: unknown) => error instanceof DirectoryActionError && error.code === "ALREADY_CANCELLED",
    );
    await assert.rejects(
      () => runEventDirectoryAction({ eventId: roles.event.id, personId: person.id, user: roles.owner.user, action: "transfer-registration" }),
      (error: unknown) => error instanceof DirectoryActionError && error.code === "ACTION_UNAVAILABLE",
    );
  } finally { await harness.cleanup(); }
});

test("Directory action route and drawer cover permissions, confirmations, duplicate prevention, and unavailable providers", () => {
  const route = readFileSync("app/api/events/[eventId]/directory/people/[personId]/actions/route.ts", "utf8");
  const service = readFileSync("src/server/services/event-directory-actions.ts", "utf8");
  const drawer = readFileSync("app/(shell)/events/[eventId]/directory/_components/person-detail-drawer.tsx", "utf8");
  assert.ok(service.includes('assertEventAccessForUser(args.eventId, args.user, "read")'));
  assert.ok(service.includes('assertEventAccessForUser(args.eventId, args.user, "write")'));
  assert.ok(route.includes("resolveDirectoryUser"));
  assert.ok(drawer.includes("window.confirm"));
  assert.ok(drawer.includes("if (workingAction) return"));
  for (const action of ["Registration details · Reg-backed", "Cancel registration", "Transfer registration · Unavailable", "Resend confirmation · Unavailable", "Assign/update room", "Speaker profile · Reg-backed", "Assigned sessions", "Resend speaker portal access · Unavailable", "View headshot", "No speaker bio available."]) assert.ok(drawer.includes(action), `missing ${action}`);
  assert.ok(service.includes("No Registration confirmation email provider is connected"));
  assert.ok(service.includes("No write-capable Registration transfer adapter is connected"));
});
