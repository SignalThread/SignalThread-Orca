import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventPersonRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createDirectoryPostHandler } from "@/app/api/events/[eventId]/directory/route";
import { EventAccessError } from "@/lib/event-access";
import {
  getEventDirectorySummary,
  listEventDirectoryPeople,
} from "@/src/server/services/event-directory";
import { aggregateEventDirectoryForEvent } from "@/src/server/services/event-directory-backfill";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for Directory integration tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `directory-aggregation-${randomUUID().slice(0, 8)}` });
}

test("explicit Directory aggregation is authorized, isolated, idempotent, and never email-merges", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventA = roles.event;
    const eventB = await harness.createEvent({
      orgId: roles.organization.id,
      createdByUserId: roles.owner.user.id,
      name: "Directory isolation event",
    });

    const eventScope = await harness.db.event.findUniqueOrThrow({
      where: { id: eventA.id },
      select: { orgId: true, clientId: true },
    });
    const sharedEmail = `shared-${randomUUID()}@planner.test`;
    const existing = await harness.db.eventDirectoryPerson.create({
      data: {
        eventId: eventA.id,
        orgId: eventScope.orgId,
        clientId: eventScope.clientId,
        displayName: "Existing Directory Person",
        email: sharedEmail,
        normalizedEmail: sharedEmail,
      },
    });
    await harness.createSpeaker({ eventId: eventA.id, name: "Module Speaker", email: sharedEmail });
    const staff = await harness.createEventPerson({
      eventId: eventA.id,
      name: "Module Staff",
      role: EventPersonRole.STAFF,
      email: `staff-${randomUUID()}@planner.test`,
    });
    const vendor = await harness.createEventPerson({
      eventId: eventA.id,
      name: "Module Vendor",
      role: EventPersonRole.VENDOR,
      email: `vendor-${randomUUID()}@planner.test`,
    });
    const seating = await harness.db.seatingAttendee.create({
      data: {
        eventId: eventA.id,
        firstName: "Module",
        lastName: "Guest",
        email: `guest-${randomUUID()}@planner.test`,
      },
    });
    const otherSpeaker = await harness.createSpeaker({
      eventId: eventB.id,
      name: "Other Event Speaker",
      email: `other-${randomUUID()}@planner.test`,
    });

    await assert.rejects(
      aggregateEventDirectoryForEvent({ eventId: eventA.id, user: roles.unrelatedSameOrgMember.accessUser }),
      (error: unknown) => error instanceof EventAccessError && error.status === 403,
    );

    const request = new NextRequest(`http://localhost/api/events/${eventA.id}/directory`, { method: "POST" });
    const unauthenticated = createDirectoryPostHandler({
      resolveUser: async () => ({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }),
    });
    assert.equal((await unauthenticated(request, { params: Promise.resolve({ eventId: eventA.id }) })).status, 401);

    const denied = createDirectoryPostHandler({ resolveUser: async () => ({ user: roles.unrelatedSameOrgMember.accessUser }) });
    assert.equal((await denied(request, { params: Promise.resolve({ eventId: eventA.id }) })).status, 403);

    const authorized = createDirectoryPostHandler({ resolveUser: async () => ({ user: roles.owner.accessUser }) });
    const firstResponse = await authorized(request, { params: Promise.resolve({ eventId: eventA.id }) });
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.total.created, 4);
    assert.equal(first.total.linksCreated, 4);
    assert.equal(first.total.needsReview, 1);
    assert.equal(first.total.skipped, 0);

    const list = await listEventDirectoryPeople({ eventId: eventA.id, user: roles.owner.accessUser });
    assert.equal(list.people.length, 5);
    const sameEmailPeople = list.people.filter((person) => person.email === sharedEmail);
    assert.equal(sameEmailPeople.length, 2, "same email remains two reviewable identities");
    assert.ok(sameEmailPeople.some((person) => person.id === existing.id));
    assert.ok(sameEmailPeople.some((person) => person.roles.includes("SPEAKER")));
    assert.ok(list.people.some((person) => person.roles.includes("STAFF")));
    assert.ok(list.people.some((person) => person.roles.includes("VENDOR")));
    assert.ok(list.people.some((person) => person.roles.includes("SEATING_GUEST")));

    const links = await harness.db.eventDirectoryModuleLink.findMany({
      where: { eventId: eventA.id },
      select: { module: true, moduleRecordId: true },
    });
    assert.ok(links.some((link) => link.module === "EVENT_PERSON" && link.moduleRecordId === staff.id));
    assert.ok(links.some((link) => link.module === "EVENT_PERSON" && link.moduleRecordId === vendor.id));
    assert.ok(links.some((link) => link.module === "SEATING_ATTENDEE" && link.moduleRecordId === seating.id));
    assert.equal(links.some((link) => link.moduleRecordId === otherSpeaker.id), false);

    const second = await aggregateEventDirectoryForEvent({ eventId: eventA.id, user: roles.owner.accessUser });
    assert.equal(second.total.created, 0);
    assert.equal(second.total.linksCreated, 0);
    assert.equal((await harness.db.eventDirectoryPerson.count({ where: { eventId: eventA.id } })), 5);

    await harness.db.eventDirectoryPerson.create({
      data: {
        eventId: eventA.id,
        orgId: eventScope.orgId,
        clientId: eventScope.clientId,
        displayName: "Removed person",
        status: "REMOVED",
      },
    });
    const defaultList = await listEventDirectoryPeople({ eventId: eventA.id, user: roles.owner.accessUser });
    const summary = await getEventDirectorySummary({ eventId: eventA.id, user: roles.owner.accessUser });
    assert.equal(defaultList.people.some((person) => person.displayName === "Removed person"), false);
    assert.equal(summary.total, defaultList.people.length);
    assert.equal(defaultList.people.some((person) => person.displayName === "Other Event Speaker"), false);
  } finally {
    await harness.cleanup();
  }
});
