import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import {
  listEventActivity,
  listEventActivityActors,
  recordEventActivity,
  EventActivityError,
} from "@/src/server/services/event-activity";
import { getPrisma } from "@/lib/prisma";
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

// --- Static / source-level guarantees (no DB required) -----------------------

test("Activity API route exposes only a read (GET) handler", () => {
  const routeSource = readFileSync("app/api/events/[eventId]/activity/route.ts", "utf8");
  assert.equal(/export const GET\b/.test(routeSource), true, "GET handler present");
  for (const verb of ["POST", "PATCH", "PUT", "DELETE"]) {
    assert.equal(
      new RegExp(`export const ${verb}\\b`).test(routeSource),
      false,
      `no ${verb} handler should exist`,
    );
  }
});

test("EventActivity schema carries the canonical audit fields", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const start = schema.indexOf("model EventActivity {");
  const block = schema.slice(start, schema.indexOf("}", start));
  for (const field of [
    "actorKind",
    "actorLabel",
    "module",
    "actionType",
    "entityType",
    "entityId",
    "entityLabel",
    "changes",
    "sourceRecordType",
    "sourceRecordId",
  ]) {
    assert.equal(block.includes(field), true, `EventActivity should define ${field}`);
  }
  assert.equal(/actorUserId\s+String\?/.test(block), true, "actorUserId is nullable");
  assert.equal(/type\s+EventActivityType\?/.test(block), true, "legacy type retained + nullable");
  assert.equal(
    block.includes("@@unique([eventId, sourceRecordType, sourceRecordId])"),
    true,
    "event-scoped source dedup",
  );
});

// --- DB-backed behavior ------------------------------------------------------

test("event Activity canonical service — write, read, filters, isolation", async (t) => {
  const harness = createHarnessOrSkip(t, "event-activity");
  if (!harness) return;

  const prisma = getPrisma();

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const owner = roles.owner;
    const viewer = roles.eventViewer; // read-only event access
    const noAccess = roles.unrelatedOtherOrgMember; // different org
    const orgOnly = roles.unrelatedSameOrgMember; // same org, no event membership

    // A second event in the same org to prove cross-event isolation.
    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: owner.user.id,
      name: "Other Fixture Event",
    });

    await t.test("users without event access cannot read activity", async () => {
      await assert.rejects(
        () => listEventActivity({ eventId, user: noAccess.accessUser }),
        (err: unknown) => (err as { status?: number }).status === 403,
      );
      await assert.rejects(
        () => listEventActivity({ eventId, user: orgOnly.accessUser }),
        (err: unknown) => (err as { status?: number }).status === 403,
      );
    });

    await t.test("event viewers with read access can read activity", async () => {
      const result = await listEventActivity({ eventId, user: viewer.accessUser });
      assert.equal(Array.isArray(result.entries), true);
    });

    await t.test("USER, SYSTEM, INTEGRATION and PORTAL actors are recorded", async () => {
      await recordEventActivity(prisma, {
        eventId,
        actor: { kind: "USER", userId: owner.user.id, label: "Fixture Owner" },
        module: "ROADMAP",
        action: "CREATED",
        entityType: "RoadmapItem",
        entityId: randomUUID(),
        entityLabel: "Kickoff milestone",
        message: "Created roadmap item Kickoff milestone",
      });
      await recordEventActivity(prisma, {
        eventId,
        actor: { kind: "SYSTEM", label: "System" },
        module: "INTEGRATIONS",
        action: "SYNCED",
        entityType: "Integration",
        entityLabel: "Registration sync",
        message: "Registration data synced",
      });
      await recordEventActivity(prisma, {
        eventId,
        actor: { kind: "INTEGRATION", label: "SendGrid" },
        module: "MARKETING",
        action: "SENT",
        entityType: "Campaign",
        entityLabel: "Welcome email",
        message: "Campaign sent",
      });
      await recordEventActivity(prisma, {
        eventId,
        actor: { kind: "PORTAL", label: "Speaker Portal" },
        module: "SPEAKERS",
        action: "UPDATED",
        entityType: "Speaker",
        entityLabel: "Jane Doe",
        message: "Speaker profile updated via portal",
      });

      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { limit: 50 } });
      const kinds = new Set(entries.map((e) => e.actorKind));
      assert.equal(kinds.has("USER"), true);
      assert.equal(kinds.has("SYSTEM"), true);
      assert.equal(kinds.has("INTEGRATION"), true);
      assert.equal(kinds.has("PORTAL"), true);

      const system = entries.find((e) => e.actorKind === "SYSTEM");
      assert.ok(system);
      assert.equal(system.actorUserId, null, "system actor has no user id");
      assert.equal(system.actorLabel, "System", "actor label snapshot stored");
    });

    await t.test("actor and entity labels are stored as snapshots", async () => {
      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { limit: 50 } });
      const withEntity = entries.find((e) => e.entityLabel === "Kickoff milestone");
      assert.ok(withEntity, "entity label snapshot present");
      assert.equal(withEntity.actorLabel, "Fixture Owner");
    });

    await t.test("sensitive fields are excluded from changes", async () => {
      await recordEventActivity(prisma, {
        eventId,
        actor: { kind: "USER", userId: owner.user.id, label: "Fixture Owner" },
        module: "EVENT_SETTINGS",
        action: "UPDATED",
        entityType: "Event",
        entityId: eventId,
        entityLabel: "Fixture Event",
        message: "Updated event settings",
        changes: [
          { field: "name", label: "Name", from: "Old", to: "New" },
          { field: "apiToken", from: "secret-a", to: "secret-b" },
          { field: "storageKey", from: "k1", to: "k2" },
          // Non-primitive value must be dropped:
          { field: "meta", from: null, to: { nested: true } as unknown as null },
        ],
      });
      const { entries } = await listEventActivity({
        eventId,
        user: owner.accessUser,
        filters: { module: "EVENT_SETTINGS", limit: 5 },
      });
      const entry = entries.find((e) => e.message === "Updated event settings");
      assert.ok(entry?.changes);
      const fields = entry.changes.map((c) => c.field);
      assert.equal(fields.includes("name"), true, "safe diff kept");
      assert.equal(fields.includes("apiToken"), false, "token excluded");
      assert.equal(fields.includes("storageKey"), false, "storage key excluded");
      assert.equal(fields.includes("meta"), false, "non-primitive dropped");
    });

    await t.test("legacy EventActivity rows remain valid and readable", async () => {
      await prisma.eventActivity.create({
        data: { eventId, actorUserId: owner.user.id, type: "SPEAKER_UPDATED", message: "Legacy speaker note" },
      });
      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { search: "Legacy" } });
      const legacy = entries.find((e) => e.message === "Legacy speaker note");
      assert.ok(legacy, "legacy row is returned");
      assert.equal(legacy.module, "SPEAKERS", "reliable legacy type gets a read-time module label");
      assert.equal(legacy.action, "UPDATED", "reliable legacy type gets a read-time action label");
      assert.equal(legacy.legacyType, "SPEAKER_UPDATED", "legacy origin remains explicit");
      assert.equal(legacy.actorKind, "USER", "actorKind defaults to USER");
    });

    await t.test("filters work independently and in combination", async () => {
      const byModule = await listEventActivity({ eventId, user: owner.accessUser, filters: { module: "MARKETING" } });
      assert.equal(byModule.entries.every((e) => e.module === "MARKETING"), true);

      const byAction = await listEventActivity({ eventId, user: owner.accessUser, filters: { action: "SENT" } });
      assert.equal(byAction.entries.every((e) => e.action === "SENT"), true);

      const { actors } = await listEventActivityActors({ eventId, user: owner.accessUser });
      const ownerActor = actors.find((actor) => actor.label === "Fixture Owner");
      assert.ok(ownerActor, "human actor option is available");
      const byActor = await listEventActivity({
        eventId,
        user: owner.accessUser,
        filters: { actor: ownerActor.id },
      });
      assert.equal(byActor.entries.every((e) => e.actorUserId === owner.user.id), true);
      assert.equal(byActor.entries.length > 0, true);

      const bySearch = await listEventActivity({ eventId, user: owner.accessUser, filters: { search: "Kickoff" } });
      assert.equal(bySearch.entries.some((e) => e.entityLabel === "Kickoff milestone"), true);

      const combined = await listEventActivity({
        eventId,
        user: owner.accessUser,
        filters: { module: "MARKETING", action: "SENT" },
      });
      assert.equal(combined.entries.every((e) => e.module === "MARKETING" && e.action === "SENT"), true);
    });

    await t.test("actor filter options are derived only from this event", async () => {
      // Write activity into the other event with a different actor kind.
      await recordEventActivity(prisma, {
        eventId: otherEvent.id,
        actor: { kind: "USER", userId: roles.admin.user.id, label: "Fixture Admin" },
        module: "BUDGET",
        action: "CREATED",
        entityType: "Budget",
        entityLabel: "Other event budget",
        message: "Created budget on other event",
      });
      const { actors } = await listEventActivityActors({ eventId, user: owner.accessUser });
      assert.equal(actors.some((a) => a.label === "Fixture Owner"), true, "owner is an actor option");
      assert.equal(actors.some((a) => a.label === "Fixture Admin"), false, "other-event actor excluded");
      assert.equal(actors.every((a) => !a.id.includes(owner.user.id)), true, "raw user UUIDs are not exposed");
    });

    await t.test("actor options deduplicate unresolved people and filter every actor kind", async () => {
      // These reproduce legacy records that retain a user relation but have no
      // actor snapshot. They must form one usable Unknown user option, not one
      // option per underlying user id.
      for (const actorUserId of [owner.user.id, roles.admin.user.id, roles.eventViewer.user.id]) {
        await prisma.eventActivity.create({
          data: {
            eventId,
            actorUserId,
            actorKind: "USER",
            actorLabel: "",
            type: "SPEAKER_UPDATED",
            message: `Unresolved legacy actor ${actorUserId}`,
          },
        });
      }
      await recordEventActivity(prisma, {
        eventId,
        actor: { kind: "INTEGRATION", label: "SendGrid" },
        module: "MARKETING",
        action: "SENT",
        entityType: "Campaign",
        entityLabel: "Follow-up",
        message: "A second SendGrid campaign was sent",
      });

      const { actors } = await listEventActivityActors({ eventId, user: owner.accessUser });
      const unknown = actors.filter((actor) => actor.label === "Unknown user");
      const system = actors.find((actor) => actor.kind === "SYSTEM");
      const sendGrid = actors.filter((actor) => actor.label === "SendGrid" && actor.kind === "INTEGRATION");
      assert.equal(unknown.length, 1, "unresolved legacy actors share one option");
      assert.ok(system, "System appears once in the Actor filter");
      assert.equal(sendGrid.length, 1, "same integration actor is deduplicated by stable key");

      const [unknownEntries, systemEntries] = await Promise.all([
        listEventActivity({ eventId, user: owner.accessUser, filters: { actor: unknown[0].id, limit: 20 } }),
        listEventActivity({ eventId, user: owner.accessUser, filters: { actor: system!.id, limit: 20 } }),
      ]);
      assert.equal(
        unknownEntries.entries.filter((entry) => entry.message.startsWith("Unresolved legacy actor ")).length,
        3,
        "Unknown user option filters every unresolved row created by this case",
      );
      assert.equal(unknownEntries.entries.every((entry) => entry.actorKind === "USER" && !entry.actorLabel), true);
      assert.equal(systemEntries.entries.length > 0, true, "System option has matching rows");
      assert.equal(systemEntries.entries.every((entry) => entry.actorKind === "SYSTEM"), true);
    });

    await t.test("cross-event activity is never returned", async () => {
      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { limit: 100 } });
      assert.equal(entries.every((e) => e.message !== "Created budget on other event"), true);
    });

    await t.test("source-record dedup is event-scoped and idempotent", async () => {
      const source = { type: "BudgetSubmission", id: randomUUID() };
      for (let i = 0; i < 3; i += 1) {
        await recordEventActivity(prisma, {
          eventId,
          actor: { kind: "USER", userId: owner.user.id, label: "Fixture Owner" },
          module: "BUDGET",
          action: "SUBMITTED",
          entityType: "Budget",
          entityLabel: "Budget",
          message: "Budget submitted",
          source,
        });
      }
      const count = await prisma.eventActivity.count({
        where: { eventId, sourceRecordType: source.type, sourceRecordId: source.id },
      });
      assert.equal(count, 1, "retries with the same source do not duplicate");

      // Same source id in a different event is allowed (independent row).
      await recordEventActivity(prisma, {
        eventId: otherEvent.id,
        actor: { kind: "USER", userId: owner.user.id, label: "Fixture Owner" },
        module: "BUDGET",
        action: "SUBMITTED",
        entityType: "Budget",
        entityLabel: "Budget",
        message: "Budget submitted",
        source,
      });
      const otherCount = await prisma.eventActivity.count({
        where: { eventId: otherEvent.id, sourceRecordType: source.type, sourceRecordId: source.id },
      });
      assert.equal(otherCount, 1, "same source id in another event is a separate row");
    });

    await t.test("pagination is stable when entries share a timestamp", async () => {
      const pageEvent = await harness.createEvent({
        orgId: roles.organization.id,
        clientId: roles.client.id,
        createdByUserId: owner.user.id,
        name: "Pagination Event",
      });
      const sharedTs = new Date("2026-05-01T12:00:00.000Z");
      const total = 25;
      for (let i = 0; i < total; i += 1) {
        await prisma.eventActivity.create({
          data: {
            eventId: pageEvent.id,
            actorUserId: owner.user.id,
            actorKind: "USER",
            actorLabel: "Fixture Owner",
            module: "ROADMAP",
            actionType: "UPDATED",
            entityType: "RoadmapItem",
            entityLabel: `Item ${i}`,
            message: `Roadmap item ${i} updated`,
            createdAt: sharedTs,
          },
        });
      }

      const seen = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: { entries: { id: string }[]; nextCursor: string | null } = await listEventActivity({
          eventId: pageEvent.id,
          user: owner.accessUser,
          filters: { limit: 20, cursor },
        });
        for (const e of res.entries) {
          assert.equal(seen.has(e.id), false, "no row appears twice across pages");
          seen.add(e.id);
        }
        cursor = res.nextCursor;
        pages += 1;
        assert.equal(pages <= 5, true, "pagination terminates");
      } while (cursor);

      assert.equal(seen.size, total, "every row is visited exactly once");
    });

    await t.test("malformed cursors are rejected safely", async () => {
      await assert.rejects(
        () => listEventActivity({ eventId, user: owner.accessUser, filters: { cursor: "!!!not-base64!!!" } }),
        (err: unknown) => err instanceof EventActivityError && (err as EventActivityError).code === "INVALID_CURSOR",
      );
    });

    await t.test("business and audit writes roll back together", async () => {
      const before = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
      const activityBefore = await prisma.eventActivity.count({ where: { eventId, message: "Rollback marker" } });

      await assert.rejects(async () => {
        await prisma.$transaction(async (tx) => {
          await tx.event.update({ where: { id: eventId }, data: { name: "Should Not Persist" } });
          await recordEventActivity(tx, {
            eventId,
            actor: { kind: "USER", userId: owner.user.id, label: "Fixture Owner" },
            module: "EVENT_SETTINGS",
            action: "UPDATED",
            entityType: "Event",
            entityId: eventId,
            entityLabel: "Fixture Event",
            message: "Rollback marker",
          });
          throw new Error("boom");
        });
      });

      const after = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } });
      const activityAfter = await prisma.eventActivity.count({ where: { eventId, message: "Rollback marker" } });
      assert.equal(after.name, before.name, "business mutation rolled back");
      assert.equal(activityAfter, activityBefore, "audit write rolled back with it");
    });
  } finally {
    await harness.cleanup();
  }
});
