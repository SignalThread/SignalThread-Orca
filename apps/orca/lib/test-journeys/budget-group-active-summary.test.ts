import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  assignGroupToLineItem,
  createOrFindBudgetGroup,
  getBudgetBlocksSummary,
  getGroupBudgetTotals,
  listBudgetGroups,
} from "@/src/server/services/budget-sessions-groups";
import { deleteLineItems, getPagedBudgetLineItems } from "@/src/server/services/budget";
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

function groupByName(summary: Awaited<ReturnType<typeof getBudgetBlocksSummary>>, name: string) {
  return summary.groups.find((group) => group.groupName === name) ?? null;
}

test("active budget groups are derived only from current assigned line items", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-group-active-summary");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });
    const orphan = await harness.db.budgetGroup.create({
      data: { budgetId: budget.id, name: "Orphan", normalizedName: "orphan", sortOrder: 1 },
    });
    const tech = await createOrFindBudgetGroup(eventId, "Tech", roles.owner.user);
    const marketing = await createOrFindBudgetGroup(eventId, "Marketing", roles.owner.user);
    const techOne = await harness.createBudgetLineItem({ budgetId: budget.id, lineItem: "Laptop", forecastCents: 1000, actualCents: 400 });
    const techTwo = await harness.createBudgetLineItem({ budgetId: budget.id, lineItem: "WiFi", forecastCents: 2500, actualCents: 2000 });
    const marketingOne = await harness.createBudgetLineItem({ budgetId: budget.id, lineItem: "Campaign", forecastCents: 700, actualCents: 100 });

    await assignGroupToLineItem(eventId, techOne.id, tech.id, roles.owner.user);
    let summary = await getBudgetBlocksSummary(eventId);
    assert.deepEqual(
      groupByName(summary, "Tech"),
      { groupId: tech.id, groupName: "Tech", groupColor: tech.color, forecastCents: 1000, actualCents: 400, rowCount: 1 },
      "a newly assigned group appears with one current row and its totals",
    );
    assert.equal(groupByName(summary, "Orphan"), null, "zero-row persisted groups do not render");
    assert.deepEqual(
      summary.groups,
      await getGroupBudgetTotals(eventId, budget.id),
      "dashboard blocks use the same active budget aggregate as the grid",
    );

    const paged = await getPagedBudgetLineItems(eventId, {});
    assert.equal(paged.rows.find((item) => item.id === techOne.id)?.groupId, tech.id, "grid and dashboard use the event's active budget rows");

    await assignGroupToLineItem(eventId, techOne.id, null, roles.owner.user);
    summary = await getBudgetBlocksSummary(eventId);
    assert.equal(groupByName(summary, "Tech"), null, "unassigning the final row removes the active group");
    assert.equal((await listBudgetGroups(eventId)).some((group) => group.id === tech.id), false, "inactive groups leave selectors");

    await assignGroupToLineItem(eventId, techOne.id, tech.id, roles.owner.user);
    await deleteLineItems(eventId, [techOne.id]);
    summary = await getBudgetBlocksSummary(eventId);
    assert.equal(groupByName(summary, "Tech"), null, "deleting the final grouped row removes the active group");
    assert.equal(await harness.db.budgetGroup.findUnique({ where: { id: tech.id } }).then((group) => group?.id), tech.id, "the persisted group definition is not deleted");

    await assignGroupToLineItem(eventId, techTwo.id, marketing.id, roles.owner.user);
    await assignGroupToLineItem(eventId, marketingOne.id, marketing.id, roles.owner.user);
    summary = await getBudgetBlocksSummary(eventId);
    assert.deepEqual(
      groupByName(summary, "Marketing"),
      { groupId: marketing.id, groupName: "Marketing", groupColor: marketing.color, forecastCents: 3200, actualCents: 2100, rowCount: 2 },
      "multiple assigned rows aggregate together",
    );

    await assignGroupToLineItem(eventId, techTwo.id, null, roles.owner.user);
    summary = await getBudgetBlocksSummary(eventId);
    assert.deepEqual(
      groupByName(summary, "Marketing"),
      { groupId: marketing.id, groupName: "Marketing", groupColor: marketing.color, forecastCents: 700, actualCents: 100, rowCount: 1 },
      "removing one row preserves the group and recalculates totals",
    );

    await harness.db.budgetLineItem.updateMany({
      where: { budgetId: budget.id, groupId: marketing.id },
      data: { groupId: null },
    });
    summary = await getBudgetBlocksSummary(eventId);
    assert.equal(groupByName(summary, "Marketing"), null, "bulk-unassigning final grouped rows removes the active group");
    assert.equal(await harness.db.budgetGroup.findUnique({ where: { id: orphan.id } }).then((group) => group?.id), orphan.id, "orphan definitions remain untouched");
  } finally {
    await harness.cleanup();
  }
});
