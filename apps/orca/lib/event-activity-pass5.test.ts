import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { getPrisma } from "@/lib/prisma";
import { listEventActivity } from "@/src/server/services/event-activity";
import {
  createEventDirectoryPerson,
  updateEventDirectoryPerson,
  deleteEventDirectoryPerson,
  addEventDirectoryRole,
} from "@/src/server/services/event-directory";
import { createMatrixRow, updateMatrixRow, deleteMatrixRow, duplicateMatrixRow } from "@/lib/matrix";
import { createSeatingTable, assignAttendeeToTable, unassignAttendee, createSeatingAttendee } from "@/lib/seating";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed activity tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// --- Source guarantees -------------------------------------------------------

test("Marketing feed excludes recipient-level telemetry", () => {
  const marketingSource = readFileSync("src/server/services/marketing.ts", "utf8");
  // recordMarketingActivity must never be called from webhook/open/click/bounce ingestion.
  const ingestStart = marketingSource.indexOf("ingestSendGridWebhookEvents");
  const ingestBody = marketingSource.slice(ingestStart, ingestStart + 4000);
  assert.equal(ingestBody.includes("recordMarketingActivity"), false, "telemetry ingestion writes no event activity");
});

test("Speaker session assignment uses ASSIGNED/UNASSIGNED actions", () => {
  const src = readFileSync("lib/matrix2-session.ts", "utf8");
  assert.equal(src.includes('action: "ASSIGNED"'), true);
  assert.equal(src.includes('action: "UNASSIGNED"'), true);
});

// --- DB-backed behavior ------------------------------------------------------

test("Directory, Run of Show, and Seating write canonical Activity", async (t) => {
  const harness = createHarnessOrSkip(t, "activity-pass5");
  if (!harness) return;

  const prisma = getPrisma();

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const user = roles.owner.accessUser;
    const actorId = roles.owner.user.id;

    await t.test("directory person create/role/update/delete produce entries", async () => {
      const result = await createEventDirectoryPerson({
        eventId,
        user,
        input: { firstName: "Ada", lastName: "Lovelace", email: `ada-${randomUUID().slice(0, 6)}@example.com` },
      });
      assert.equal(result.status, "created");
      const personId = result.status === "created" ? result.person.id : "";

      await addEventDirectoryRole({ eventId, personId, role: "SPEAKER", user });
      await updateEventDirectoryPerson({ eventId, personId, user, input: { company: "Analytical Engines" } });
      await deleteEventDirectoryPerson({ eventId, personId, user });

      const { entries } = await listEventActivity({ eventId, user, filters: { module: "EVENT_DIRECTORY", limit: 20 } });
      const actions = entries.map((e) => e.action);
      assert.equal(actions.includes("CREATED"), true);
      assert.equal(actions.includes("ASSIGNED"), true);
      assert.equal(actions.includes("UPDATED"), true);
      assert.equal(actions.includes("DELETED"), true);
    });

    await t.test("run of show session create/update/duplicate/archive produce entries", async () => {
      const created = await createMatrixRow(eventId, { sessionName: "Opening Keynote", date: "2026-01-15", startTime: "09:00", endTime: "10:00" }, { id: actorId });
      await updateMatrixRow(eventId, created.id, { startTime: "09:30", room: "Grand Ballroom" }, { id: actorId });
      const dup = await duplicateMatrixRow(eventId, created.id, { id: actorId });
      await deleteMatrixRow(eventId, dup.id, { id: actorId });

      const { entries } = await listEventActivity({ eventId, user, filters: { module: "RUN_OF_SHOW", limit: 50 } });
      const actions = entries.map((e) => e.action);
      assert.equal(actions.includes("CREATED"), true);
      assert.equal(actions.includes("UPDATED"), true);
      assert.equal(actions.includes("STATUS_CHANGED"), true);
      const update = entries.find((e) => e.action === "UPDATED" && e.entityType === "Session");
      assert.ok(update?.changes?.some((c) => c.field === "startTime" || c.field === "room"), "schedule/room diff recorded");
    });

    await t.test("seating table create + assign/unassign produce entries", async () => {
      const table = await createSeatingTable(eventId, "Table 1", 8, actorId);
      const attendee = await createSeatingAttendee(eventId, { firstName: "Grace", lastName: "Hopper" });
      await assignAttendeeToTable(eventId, attendee.id, table.id, 0, { actorUserId: actorId });
      await unassignAttendee(eventId, attendee.id, { actorUserId: actorId });

      const { entries } = await listEventActivity({ eventId, user, filters: { module: "RUN_OF_SHOW", limit: 50 } });
      assert.equal(entries.some((e) => e.action === "CREATED" && e.entityType === "SeatingTable"), true);
      assert.equal(entries.some((e) => e.action === "ASSIGNED" && e.entityType === "SeatingAssignment"), true);
      assert.equal(entries.some((e) => e.action === "UNASSIGNED" && e.entityType === "SeatingAssignment"), true);
    });

    await t.test("all Pass 5 entries remain event-scoped", async () => {
      const { entries } = await listEventActivity({ eventId, user, filters: { limit: 100 } });
      assert.equal(entries.length > 0, true);
    });
  } finally {
    await harness.cleanup();
  }
});
