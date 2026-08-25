import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { BudgetLineItemApproval, UserRole } from "@prisma/client";
import { getCommandCenterDashboardData } from "@/src/server/services/command-center-dashboard";
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

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

// P1-7 regression: the account dashboard budget rollups must be computed with
// DB-side aggregates and equal the prior JS semantics on a known fixture. This
// covers org totals, per-budget totals, category breakdown (actionable set),
// pending approvals, and over-forecast counts (org vs per-budget), plus an empty
// budget case.
test("Account dashboard budget aggregates match prior JS semantics", async (t) => {
  const harness = createHarnessOrSkip(t, "account-budget-agg");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const orgId = roles.organization.id;
    const today = startOfToday();

    const eventOne = roles.event;
    const eventTwo = await harness.createEvent({ orgId, createdByUserId: roles.owner.user.id, name: "Event Two" });
    const eventEmpty = await harness.createEvent({ orgId, createdByUserId: roles.owner.user.id, name: "Empty Budget Event" });

    const budgetOne = await harness.createBudget({ eventId: eventOne.id });
    const budgetTwo = await harness.createBudget({ eventId: eventTwo.id });
    const budgetEmpty = await harness.createBudget({ eventId: eventEmpty.id });

    const approve = async (id: string) =>
      harness.db.budgetLineItem.update({ where: { id }, data: { approval: BudgetLineItemApproval.APPROVED } });

    // Budget one line items.
    await harness.createBudgetLineItem({ budgetId: budgetOne.id, category: "A/V", forecastCents: 10000, actualCents: 5000 }); // pending, not over
    const li2 = await harness.createBudgetLineItem({ budgetId: budgetOne.id, category: "A/V", forecastCents: 2000, actualCents: 3000 }); // over
    const li3 = await harness.createBudgetLineItem({ budgetId: budgetOne.id, category: "Food", forecastCents: 8000, actualCents: 0 }); // non-actionable
    await harness.createBudgetLineItem({ budgetId: budgetOne.id, category: "Food", forecastCents: 1000, actualCents: 0 }); // pending, no spend
    await approve(li2.id);
    await approve(li3.id);

    // Budget two line items.
    const li5 = await harness.createBudgetLineItem({ budgetId: budgetTwo.id, category: "A/V", forecastCents: 0, actualCents: 500 }); // over org-only (forecast 0)
    await harness.createBudgetLineItem({ budgetId: budgetTwo.id, category: "Travel", forecastCents: 5000, actualCents: 6000 }); // over
    await approve(li5.id);

    const data = await getCommandCenterDashboardData({
      orgId,
      appUserId: roles.owner.user.id,
      role: UserRole.OWNER,
      today,
      nearFuture: today,
    });

    // Org totals over ALL line items (including non-actionable LI3).
    assert.equal(data.budgetTotals.forecastCents, 26000, "org forecast total");
    assert.equal(data.budgetTotals.actualCents, 14500, "org actual total");

    // Per-budget totals.
    const totalsFor = (budgetId: string) =>
      data.budgetTotalsByBudgetId.find((group) => group.budgetId === budgetId);
    assert.deepEqual(
      { f: totalsFor(budgetOne.id)?.forecastCents, a: totalsFor(budgetOne.id)?.actualCents },
      { f: 21000, a: 8000 },
      "budget one totals",
    );
    assert.deepEqual(
      { f: totalsFor(budgetTwo.id)?.forecastCents, a: totalsFor(budgetTwo.id)?.actualCents },
      { f: 5000, a: 6500 },
      "budget two totals",
    );
    // Empty budget contributes no group (page defaults it to 0/0).
    assert.equal(totalsFor(budgetEmpty.id), undefined, "empty budget has no totals group");

    // Category breakdown over the actionable set (LI3 Food/approved/0 excluded).
    const categoryFor = (name: string) =>
      data.budgetCategoryBreakdown.find((category) => category.category === name);
    assert.deepEqual(
      categoryFor("A/V"),
      { category: "A/V", forecastCents: 12000, actualCents: 8500, pendingCount: 1 },
      "A/V category",
    );
    assert.deepEqual(
      categoryFor("Food"),
      { category: "Food", forecastCents: 1000, actualCents: 0, pendingCount: 1 },
      "Food category excludes non-actionable LI3",
    );
    assert.deepEqual(
      categoryFor("Travel"),
      { category: "Travel", forecastCents: 5000, actualCents: 6000, pendingCount: 1 },
      "Travel category",
    );

    // Pending approvals (org + per-budget).
    assert.equal(data.budgetPendingApprovalCount, 3, "org pending approvals");
    const pendingFor = (budgetId: string) =>
      data.budgetPendingByBudgetId.find((group) => group.budgetId === budgetId)?.pendingCount ?? 0;
    assert.equal(pendingFor(budgetOne.id), 2, "budget one pending");
    assert.equal(pendingFor(budgetTwo.id), 1, "budget two pending");

    // Over-forecast: org counts actual>forecast (3); per-budget also requires forecast>0.
    assert.equal(data.budgetOverForecastOrgCount, 3, "org over-forecast count");
    const overFor = (budgetId: string) =>
      data.budgetOverForecastByBudgetId.find((group) => group.budgetId === budgetId)?.overCount ?? 0;
    assert.equal(overFor(budgetOne.id), 1, "budget one over-forecast (forecast>0)");
    assert.equal(overFor(budgetTwo.id), 1, "budget two over-forecast excludes forecast=0 item");
  } finally {
    await harness.cleanup();
  }
});
