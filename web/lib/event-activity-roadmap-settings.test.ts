import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { getPrisma } from "@/lib/prisma";
import { listEventActivity } from "@/src/server/services/event-activity";
import { buildTimelineDiff, isStatusOnlyKindChange } from "@/src/server/services/timeline-activity-audit";
import {
  createTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  bulkUpdateTimelineItems,
  createTimelineDependency,
  deleteTimelineDependency,
} from "@/src/server/services/timeline";
import { updateEvent } from "@/lib/events";
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

// --- Pure diff logic ---------------------------------------------------------

test("buildTimelineDiff records only changed fields, with owner/parent labels", () => {
  const before = {
    title: "Kickoff",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    startDate: new Date("2026-08-01"),
    endDate: new Date("2026-08-02"),
    ownerUserId: "u1",
    parentId: null,
  };
  const owner = new Map([["u2", "Ada Lovelace"]]);
  const diff = buildTimelineDiff(before, { status: "IN_PROGRESS", ownerUserId: "u2" }, { owner });
  const fields = diff.map((d) => d.field);
  assert.deepEqual(fields.sort(), ["ownerUserId", "status"]);
  assert.equal(diff.find((d) => d.field === "status")?.to, "IN_PROGRESS");
  assert.equal(diff.find((d) => d.field === "ownerUserId")?.to, "Ada Lovelace");
});

test("isStatusOnlyKindChange only true when status is the sole change", () => {
  assert.equal(isStatusOnlyKindChange([{ field: "status", from: "a", to: "b" }]), true);
  assert.equal(isStatusOnlyKindChange([{ field: "status", from: "a", to: "b" }, { field: "title", from: "x", to: "y" }]), false);
  assert.equal(isStatusOnlyKindChange([]), false);
});

// --- Source-level guarantees for event creation + integrations ---------------

test("event creation and integration config route through the canonical service", () => {
  const eventsSource = readFileSync("lib/events.ts", "utf8");
  assert.equal(eventsSource.includes("recordEventActivity"), true);
  assert.equal(eventsSource.includes('module: "EVENT_SETTINGS"'), true);
  assert.equal(eventsSource.includes('action: "CREATED"'), true);

  const integrationSource = readFileSync("src/server/services/event-integration.ts", "utf8");
  assert.equal(integrationSource.includes('module: "INTEGRATIONS"'), true);
  // Never logs provider secrets / capability payloads.
  assert.equal(/entityLabel:\s*provider/.test(integrationSource), true);
});

// --- DB-backed roadmap + event-settings behavior -----------------------------

test("Roadmap and Event Settings mutations write canonical Activity", async (t) => {
  const harness = createHarnessOrSkip(t, "activity-roadmap");
  if (!harness) return;

  const prisma = getPrisma();

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const user = roles.owner.accessUser;

    let itemId = "";
    let secondItemId = "";

    await t.test("roadmap create/update(status)/update(fields)/delete produce entries", async () => {
      const created = await createTimelineItem(eventId, user, {
        title: "Kickoff milestone",
        startDate: "2026-08-01",
        endDate: "2026-08-01",
      } as never);
      itemId = created.id;

      await updateTimelineItem(eventId, itemId, user, { status: "IN_PROGRESS" } as never);
      await updateTimelineItem(eventId, itemId, user, { title: "Kickoff milestone (rev)", priority: "HIGH" } as never);

      const { entries } = await listEventActivity({ eventId, user, filters: { module: "ROADMAP", limit: 50 } });
      assert.equal(entries.some((e) => e.action === "CREATED"), true);
      const statusChange = entries.find((e) => e.action === "STATUS_CHANGED");
      assert.ok(statusChange, "status-only change uses STATUS_CHANGED");
      assert.ok(statusChange.changes?.some((c) => c.field === "status"));
      const fieldUpdate = entries.find((e) => e.action === "UPDATED" && e.entityType === "TimelineItem");
      assert.ok(fieldUpdate?.changes?.some((c) => c.field === "priority"));
    });

    await t.test("unchanged roadmap update writes no activity", async () => {
      const before = await prisma.eventActivity.count({ where: { eventId, module: "ROADMAP" } });
      await updateTimelineItem(eventId, itemId, user, { status: "IN_PROGRESS" } as never); // already IN_PROGRESS
      const after = await prisma.eventActivity.count({ where: { eventId, module: "ROADMAP" } });
      assert.equal(after, before, "no-op update is silent");
    });

    await t.test("dependency link/unlink identify both items", async () => {
      const second = await createTimelineItem(eventId, user, {
        title: "Venue confirmed",
        startDate: "2026-08-05",
        endDate: "2026-08-05",
      } as never);
      secondItemId = second.id;

      const dep = await createTimelineDependency(eventId, user, {
        predecessorItemId: itemId,
        successorItemId: secondItemId,
      } as never);
      const linked = (await listEventActivity({ eventId, user, filters: { module: "ROADMAP", action: "LINKED", limit: 5 } })).entries[0];
      assert.ok(linked);
      assert.match(linked.entityLabel ?? "", /→/, "both items identified");

      await deleteTimelineDependency(eventId, dep.id, user);
      const unlinked = (await listEventActivity({ eventId, user, filters: { module: "ROADMAP", action: "UNLINKED", limit: 5 } })).entries[0];
      assert.ok(unlinked);
    });

    await t.test("bulk update produces a single summary entry", async () => {
      const before = await prisma.eventActivity.count({ where: { eventId, module: "ROADMAP", actionType: "UPDATED" } });
      await bulkUpdateTimelineItems(eventId, user, { itemIds: [itemId, secondItemId], patch: { priority: "LOW" } } as never);
      const after = await prisma.eventActivity.count({ where: { eventId, module: "ROADMAP", actionType: "UPDATED" } });
      assert.equal(after - before, 1, "one summary entry for the bulk update");
    });

    await t.test("roadmap delete preserves the deleted item label", async () => {
      await deleteTimelineItem(eventId, secondItemId, user);
      const del = (await listEventActivity({ eventId, user, filters: { module: "ROADMAP", action: "DELETED", limit: 5 } })).entries[0];
      assert.ok(del);
      assert.match(del.message, /Venue confirmed/);
    });

    await t.test("event settings update records diffs; status-only uses STATUS_CHANGED", async () => {
      await updateEvent(eventId, { name: "Renamed Fixture Event" }, { id: roles.owner.user.id });
      await updateEvent(eventId, { status: "COMPLETED" }, { id: roles.owner.user.id });

      const { entries } = await listEventActivity({ eventId, user, filters: { module: "EVENT_SETTINGS", limit: 20 } });
      const nameChange = entries.find((e) => e.action === "UPDATED" && e.changes?.some((c) => c.field === "name"));
      assert.ok(nameChange, "name change recorded with diff");
      const statusChange = entries.find((e) => e.action === "STATUS_CHANGED");
      assert.ok(statusChange, "status-only change uses STATUS_CHANGED");
    });
  } finally {
    await harness.cleanup();
  }
});
