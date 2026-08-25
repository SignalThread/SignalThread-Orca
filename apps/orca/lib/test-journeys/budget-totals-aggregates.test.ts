import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { getBudgetCategoryDisplay } from "@/lib/budget-category-filter";
import {
  getCategoryBudgetTotals,
  getGroupBudgetTotals,
  getSessionBudgetTotal,
  getSessionsBudgetTotal,
} from "@/src/server/services/budget-sessions-groups";
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

// B7 regression: totals-only budget endpoints use DB groupBy/_sum/_count. Assert
// the aggregate results equal hand-computed totals, including edge cases: zero
// actual, forecast without actual, actual > forecast (incl. forecast 0), and raw
// categories that collapse to the same display key.
test("Budget totals-only endpoints match hand-computed aggregates", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-totals-aggregates");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });

    const groupA = await harness.db.budgetGroup.create({
      data: { budgetId: budget.id, name: "Group A", normalizedName: "group a", color: "blue", sortOrder: 1 },
    });
    const groupB = await harness.db.budgetGroup.create({
      data: { budgetId: budget.id, name: "Group B", normalizedName: "group b", color: "emerald", sortOrder: 2 },
    });
    const groupEmpty = await harness.db.budgetGroup.create({
      data: { budgetId: budget.id, name: "Group Empty", normalizedName: "group empty", color: "rose", sortOrder: 3 },
    });

    const sessionOne = await harness.createMatrixRow({ eventId, sessionName: "Session One" });
    const sessionTwo = await harness.createMatrixRow({ eventId, sessionName: "Session Two" });

    // LI1 + LI2: category A/V, group A, session One.
    const li1 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", forecastCents: 1000, actualCents: 500, matrixRowId: sessionOne.id });
    const li2 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", forecastCents: 2000, actualCents: 2500, matrixRowId: sessionOne.id });
    // LI3: Food, group B, session Two — forecast without actual.
    const li3 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", forecastCents: 5000, actualCents: 0, matrixRowId: sessionTwo.id });
    // LI4: same "Food" category, no group/session — aggregates with LI3.
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", forecastCents: 1000, actualCents: 1200 });
    // LI5: Travel, group B — actual > forecast with forecast 0.
    const li5 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Travel", forecastCents: 0, actualCents: 300 });

    await harness.db.budgetLineItem.update({ where: { id: li1.id }, data: { groupId: groupA.id } });
    await harness.db.budgetLineItem.update({ where: { id: li2.id }, data: { groupId: groupA.id } });
    await harness.db.budgetLineItem.update({ where: { id: li3.id }, data: { groupId: groupB.id } });
    await harness.db.budgetLineItem.update({ where: { id: li5.id }, data: { groupId: groupB.id } });

    // --- Group totals (keyed by groupId; no normalization) ---
    const groupTotals = await getGroupBudgetTotals(eventId);
    const byGroupId = new Map(groupTotals.map((g) => [g.groupId, g]));
    assert.deepEqual(
      { f: byGroupId.get(groupA.id)?.forecastCents, a: byGroupId.get(groupA.id)?.actualCents, n: byGroupId.get(groupA.id)?.rowCount },
      { f: 3000, a: 3000, n: 2 },
      "group A totals",
    );
    assert.deepEqual(
      { f: byGroupId.get(groupB.id)?.forecastCents, a: byGroupId.get(groupB.id)?.actualCents, n: byGroupId.get(groupB.id)?.rowCount },
      { f: 5000, a: 300, n: 2 },
      "group B totals (forecast without actual + over-forecast)",
    );
    assert.equal(byGroupId.has(groupEmpty.id), false, "empty persisted groups are excluded from active totals");

    // --- Category totals (raw categories collapse to display key) ---
    const categoryTotals = await getCategoryBudgetTotals(eventId);
    const foodKey = getBudgetCategoryDisplay("Food");
    const food = categoryTotals.find((c) => c.categoryKey === foodKey);
    assert.ok(food, "food display category present");
    // Two "Food" rows (5000/0 and 1000/1200) aggregate.
    assert.equal(food.forecastCents, 6000, "food forecast aggregated");
    assert.equal(food.actualCents, 1200, "food actual aggregated");
    assert.equal(food.rowCount, 2, "food row count aggregated");
    // Grand totals across all categories equal the sum of all line items.
    const grandForecast = categoryTotals.reduce((s, c) => s + c.forecastCents, 0);
    const grandActual = categoryTotals.reduce((s, c) => s + c.actualCents, 0);
    const grandRows = categoryTotals.reduce((s, c) => s + c.rowCount, 0);
    assert.equal(grandForecast, 9000, "grand forecast");
    assert.equal(grandActual, 4500, "grand actual");
    assert.equal(grandRows, 5, "grand row count");

    // --- Session totals (aggregate) ---
    const sessionOneTotal = await getSessionBudgetTotal(eventId, sessionOne.id);
    assert.deepEqual(
      { f: sessionOneTotal.forecastCents, a: sessionOneTotal.actualCents, n: sessionOneTotal.rowCount, title: sessionOneTotal.sessionTitle },
      { f: 3000, a: 3000, n: 2, title: "Session One" },
      "single session total",
    );
    const combined = await getSessionsBudgetTotal(eventId, [sessionOne.id, sessionTwo.id]);
    assert.deepEqual(
      { f: combined.forecastCents, a: combined.actualCents, n: combined.rowCount, s: combined.sessionCount },
      { f: 8000, a: 3000, n: 3, s: 2 },
      "combined session totals",
    );
  } finally {
    await harness.cleanup();
  }
});
