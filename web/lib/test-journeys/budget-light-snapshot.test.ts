import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { getBudgetSnapshot } from "@/src/server/services/budget";
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

// Prompt 6 (Budget deep performance): the light snapshot must skip the full
// line-item array while still returning authoritative global totals and an
// accurate lineItemCount, and the full snapshot must remain available.
test("getBudgetSnapshot: light mode omits rows but keeps authoritative totals + count", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-light-snapshot");
  if (!harness) return;

  const commonOptions = { includeSubmissions: false, includeBudgetFiles: false, includeRecipients: false } as const;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });

    await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", forecastCents: 1000, actualCents: 500 });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", forecastCents: 2000, actualCents: 2500 });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "Travel", forecastCents: 0, actualCents: 300 });

    const full = await getBudgetSnapshot(eventId, { ...commonOptions });
    assert.equal(full.lineItems.length, 3, "full snapshot ships every row");
    assert.equal(full.lineItemCount, 3, "full snapshot reports the count");
    assert.equal(full.totals.totalForecastCents, 3000, "full forecast total");
    assert.equal(full.totals.totalActualCents, 3300, "full actual total");

    const light = await getBudgetSnapshot(eventId, { ...commonOptions, includeLineItems: false });
    assert.equal(light.lineItems.length, 0, "light snapshot omits the full row array");
    assert.equal(light.lineItemCount, 3, "light snapshot still reports the authoritative count");
    // Global totals must be identical between full and light modes.
    assert.deepEqual(light.totals, full.totals, "light totals equal full totals (authoritative, not page-only)");
  } finally {
    await harness.cleanup();
  }
});

// A budget with no line items reports zeroed totals and a zero count in both modes.
test("getBudgetSnapshot: empty budget yields zero totals/count in light and full mode", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-light-snapshot-empty");
  if (!harness) return;

  const commonOptions = { includeSubmissions: false, includeBudgetFiles: false, includeRecipients: false } as const;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    await harness.createBudget({ eventId });

    const light = await getBudgetSnapshot(eventId, { ...commonOptions, includeLineItems: false });
    assert.equal(light.lineItemCount, 0, "no rows => zero count");
    assert.equal(light.totals.totalForecastCents, 0, "no rows => zero forecast");
    assert.equal(light.totals.totalActualCents, 0, "no rows => zero actual");
    assert.equal(light.lineItems.length, 0, "no rows in light mode");
  } finally {
    await harness.cleanup();
  }
});
