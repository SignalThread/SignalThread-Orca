import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { getBudgetDashboard, BudgetServiceError } from "@/src/server/services/budget";
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

// B5 regression: the dashboard resolves read + write capability in a single pass
// (no throw/catch capability probe). Permissions and totals must be unchanged.
test("Budget dashboard preserves permissions and totals with single-auth resolution", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-dashboard-single-auth");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;

    const budget = await harness.createBudget({ eventId });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", forecastCents: 10000, actualCents: 4000 });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", forecastCents: 25000, actualCents: 26000 });

    // Owner (org OWNER) can write.
    const ownerDash = await getBudgetDashboard(eventId, roles.owner.accessUser);
    assert.equal(ownerDash.permissions.canWriteBudget, true, "owner can write");
    // Totals derived from line items unchanged.
    assert.equal(ownerDash.summary.totalForecastCents, 35000, "forecast total");
    assert.equal(ownerDash.summary.totalActualCents, 30000, "actual total");
    assert.equal(ownerDash.summary.lineItemCount, 2, "line item count");

    // Event editor (member) can write.
    const memberDash = await getBudgetDashboard(eventId, roles.member.accessUser);
    assert.equal(memberDash.permissions.canWriteBudget, true, "event editor can write");

    // EVENT_VIEWER is read-only.
    const viewerDash = await getBudgetDashboard(eventId, roles.eventViewer.accessUser);
    assert.equal(viewerDash.permissions.canWriteBudget, false, "event viewer is read-only");
    // Read-only user still sees the same totals.
    assert.equal(viewerDash.summary.totalForecastCents, 35000, "read-only sees totals");

    // A same-org user with no event membership cannot read (403).
    await assert.rejects(
      () => getBudgetDashboard(eventId, roles.unrelatedSameOrgMember.accessUser),
      (error: unknown) => error instanceof BudgetServiceError && error.status === 403,
      "non-member is denied read",
    );
  } finally {
    await harness.cleanup();
  }
});
