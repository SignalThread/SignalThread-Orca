import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { getPrisma } from "@/lib/prisma";
import { listEventActivity } from "@/src/server/services/event-activity";
import {
  addLineItem,
  updateLineItem,
  deleteLineItem,
  deleteLineItems,
  getOrCreateBudgetForEvent,
} from "@/src/server/services/budget";
import {
  createDocumentCategoryForEvent,
  createDocumentDraft,
  updateDocumentMetadata,
} from "@/src/server/services/documents";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";
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

// --- Source-level guarantees for the migrated existing writers -----------------

test("the two existing EventActivity writers now delegate to the canonical service", () => {
  const speakerSource = readFileSync("src/server/services/speaker-comms.ts", "utf8");
  const directorySource = readFileSync("src/server/services/event-directory.ts", "utf8");

  // No more direct eventActivity.create or swallowed failures in the migrated writers.
  assert.equal(speakerSource.includes("recordEventActivity"), true);
  assert.equal(/eventActivity\.create/.test(speakerSource), false, "speaker writer no longer writes EventActivity directly");
  assert.equal(speakerSource.includes("Failed to record speaker activity"), false, "swallow removed");

  assert.equal(directorySource.includes("recordEventActivity"), true);
  assert.equal(
    directorySource.includes("Failed to record directory email activity"),
    false,
    "directory swallow removed",
  );
  assert.equal(directorySource.includes('module: "EVENT_DIRECTORY"'), true);
});

test("instrumented budget mutations write audit inside a transaction", () => {
  const budgetSource = readFileSync("src/server/services/budget.ts", "utf8");
  assert.equal(budgetSource.includes("recordEventActivity"), true);
  // Line-item create/delete/update are wrapped in $transaction with the audit write.
  assert.equal(budgetSource.includes("getPrisma().$transaction(async (tx) => {"), true);
});

// --- DB-backed instrumentation behavior ---------------------------------------

test("Budget and Document mutations write canonical Activity entries", async (t) => {
  const harness = createHarnessOrSkip(t, "activity-instrumentation");
  if (!harness) return;

  const prisma = getPrisma();

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const owner = roles.owner;

    await getOrCreateBudgetForEvent(eventId);

    await t.test("budget line item create/update/delete produce correct entries", async () => {
      const created = await addLineItem(eventId, { lineItem: "Stage", forecastCents: 50000 }, { id: owner.user.id });
      const updated = await updateLineItem(eventId, created.id, { forecastCents: 75000, status: "COMMITTED" }, { id: owner.user.id });
      await deleteLineItem(eventId, updated.id, { id: owner.user.id });

      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { module: "BUDGET", limit: 50 } });
      const actions = entries.map((e) => e.action);
      assert.equal(actions.includes("CREATED"), true);
      assert.equal(actions.includes("UPDATED"), true);
      assert.equal(actions.includes("DELETED"), true);

      const update = entries.find((e) => e.action === "UPDATED");
      assert.ok(update?.changes, "update carries a diff");
      const forecast = update.changes.find((c) => c.field === "forecastCents");
      assert.ok(forecast, "forecast diff present");
      assert.equal(forecast.to, "$750.00", "money precision preserved");
      // Actor + entity are correct.
      assert.equal(update.actorKind, "USER");
    });

    await t.test("bulk delete produces a single summary entry with a count", async () => {
      const a = await addLineItem(eventId, { lineItem: "Bulk A" }, { id: owner.user.id });
      const b = await addLineItem(eventId, { lineItem: "Bulk B" }, { id: owner.user.id });
      const before = await prisma.eventActivity.count({ where: { eventId, module: "BUDGET", actionType: "DELETED" } });
      await deleteLineItems(eventId, [a.id, b.id], { id: owner.user.id });
      const after = await prisma.eventActivity.count({ where: { eventId, module: "BUDGET", actionType: "DELETED" } });
      assert.equal(after - before, 1, "one summary entry, not one per row");
      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { module: "BUDGET", action: "DELETED", limit: 5 } });
      assert.equal(entries.some((e) => /Deleted 2 budget line items in bulk/.test(e.message)), true);
    });

    await t.test("document draft, category, and metadata changes produce entries", async () => {
      const category = await createDocumentCategoryForEvent(eventId, { name: "Contracts" }, { id: owner.user.id });
      const draft = await createDocumentDraft(
        eventId,
        { title: "Vendor Agreement", categoryId: category.id },
        { id: owner.user.id },
      );
      await updateDocumentMetadata(eventId, draft.id, { title: "Vendor Agreement v2" }, { id: owner.user.id });

      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { module: "DOCUMENTS", limit: 50 } });
      assert.equal(entries.some((e) => e.action === "CREATED" && e.entityType === "DocumentCategory"), true);
      assert.equal(entries.some((e) => e.action === "CREATED" && e.entityType === "Document"), true);
      const meta = entries.find((e) => e.action === "UPDATED" && e.entityType === "Document");
      assert.ok(meta?.changes?.some((c) => c.field === "title"), "title diff recorded");
    });

    await t.test("speaker activity flows through the canonical writer (module SPEAKERS)", async () => {
      await logSpeakerActivity(eventId, owner.user.id, "Speaker created: Ada Lovelace", { action: "CREATED", entityLabel: "Ada Lovelace" });
      const { entries } = await listEventActivity({ eventId, user: owner.accessUser, filters: { module: "SPEAKERS", limit: 10 } });
      assert.equal(entries.some((e) => e.message === "Speaker created: Ada Lovelace" && e.action === "CREATED"), true);
    });

    await t.test("unchanged budget update records no noisy activity", async () => {
      const item = await addLineItem(eventId, { lineItem: "NoChange", forecastCents: 1000 }, { id: owner.user.id });
      const before = await prisma.eventActivity.count({ where: { eventId, module: "BUDGET", actionType: "UPDATED" } });
      await updateLineItem(eventId, item.id, { forecastCents: 1000 }, { id: owner.user.id });
      const after = await prisma.eventActivity.count({ where: { eventId, module: "BUDGET", actionType: "UPDATED" } });
      assert.equal(after, before, "no-op update creates no activity");
    });
  } finally {
    await harness.cleanup();
  }
});
