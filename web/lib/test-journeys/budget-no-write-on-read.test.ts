import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  getBudgetForEventReadOnly,
  getBudgetSnapshot,
  getOrCreateBudgetForEvent,
} from "@/src/server/services/budget";
import { getBudgetBlocksSummary } from "@/src/server/services/budget-sessions-groups";
import { getPrisma } from "@/lib/prisma";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// B2 + B6 regression: budget GET/read paths must not create/upsert a Budget row,
// while write paths still create it on demand.
test("Budget read paths do not create a Budget row; write paths still do", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-no-write-on-read");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const prisma = getPrisma();

    // No Budget row exists initially.
    assert.equal(await getBudgetForEventReadOnly(eventId), null, "no budget row initially");

    // Snapshot read returns a valid empty state and creates nothing.
    const snapshot = await getBudgetSnapshot(eventId, {
      currentUserId: roles.owner.user.id,
      includeActivity: true,
      includeRecipients: true,
      includeSubmissions: true,
      includeSubmissionDetails: true,
      includeBudgetFiles: true,
    });
    assert.equal(snapshot.budget.id, "", "synthetic empty budget id");
    assert.equal(snapshot.budget.status, "DRAFT", "empty budget is DRAFT");
    assert.equal(snapshot.lineItems.length, 0, "no line items");
    assert.equal(snapshot.totals.totalForecastCents, 0, "zero forecast");
    assert.equal(snapshot.totals.totalActualCents, 0, "zero actual");
    assert.equal(
      await prisma.budget.findUnique({ where: { eventId } }),
      null,
      "snapshot read did not create a Budget row",
    );

    // Blocks summary read also creates nothing (B6: single read-only lookup).
    const blocks = await getBudgetBlocksSummary(eventId);
    assert.deepEqual(blocks, { categories: [], groups: [] }, "empty blocks summary");
    assert.equal(
      await prisma.budget.findUnique({ where: { eventId } }),
      null,
      "blocks summary read did not create a Budget row",
    );

    // Write/mutation path still creates the Budget row on demand.
    const created = await getOrCreateBudgetForEvent(eventId);
    assert.notEqual(created.id, "", "write path created a real budget id");
    const persisted = await prisma.budget.findUnique({ where: { eventId } });
    assert.notEqual(persisted, null, "budget row persisted after write path");

    // Snapshot now reflects the real budget id.
    const afterCreate = await getBudgetSnapshot(eventId, { currentUserId: roles.owner.user.id });
    assert.equal(afterCreate.budget.id, created.id, "snapshot uses the real budget id");
  } finally {
    // The scoped harness teardown removes the write-path budget and all of its
    // dependents in reverse dependency order. Do not mask a failed deletion.
    await harness.cleanup();
  }
});
