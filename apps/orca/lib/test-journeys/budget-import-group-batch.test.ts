import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { importLineItems } from "@/src/server/services/budget";
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

// B10 regression: import batches group creation (createMany + re-read) instead of
// one insert per group. Each distinct normalized group must be created exactly
// once, repeated group names must not error, and every line item must link to the
// correct group. An existing group must be reused, not duplicated.
test("budget import creates each group once and links line items correctly", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-import-group-batch");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });

    // Pre-existing group that the import should reuse (not duplicate).
    await harness.db.budgetGroup.create({
      data: { budgetId: budget.id, name: "Production", normalizedName: "production", sortOrder: 1 },
    });

    const rows = [
      { category: "A/V", lineItem: "Projector", forecastCents: 10000, group: "Production" }, // existing group
      { category: "A/V", lineItem: "Screen", forecastCents: 5000, group: "production" }, // same normalized -> reuse
      { category: "Food", lineItem: "Lunch", forecastCents: 25000, group: "Catering" }, // new group
      { category: "Food", lineItem: "Snacks", forecastCents: 3000, group: " catering " }, // same normalized as Catering
      { category: "Travel", lineItem: "Flights", forecastCents: 8000 }, // no group
    ];

    const imported = await importLineItems(eventId, rows, { actorUserId: roles.owner.user.id, user: roles.owner.user });
    assert.equal(imported.length, 5, "all rows imported");

    // Exactly two distinct groups exist (Production reused, Catering created once).
    const groups = await getPrisma().budgetGroup.findMany({
      where: { budgetId: budget.id },
      select: { id: true, name: true, normalizedName: true },
      orderBy: { sortOrder: "asc" },
    });
    assert.deepEqual(
      groups.map((g) => g.normalizedName).sort(),
      ["catering", "production"],
      "each distinct group exists exactly once (existing reused, new created once)",
    );
    const productionId = groups.find((g) => g.normalizedName === "production")!.id;
    const cateringId = groups.find((g) => g.normalizedName === "catering")!.id;

    // Line items link to the correct groups.
    const byLineItem = new Map(imported.map((li) => [li.lineItem, li.groupId]));
    assert.equal(byLineItem.get("Projector"), productionId, "Projector -> Production");
    assert.equal(byLineItem.get("Screen"), productionId, "Screen -> Production (normalized reuse)");
    assert.equal(byLineItem.get("Lunch"), cateringId, "Lunch -> Catering");
    assert.equal(byLineItem.get("Snacks"), cateringId, "Snacks -> Catering (normalized reuse)");
    assert.equal(byLineItem.get("Flights"), null, "no-group row stays ungrouped");
  } finally {
    await harness.cleanup();
  }
});
