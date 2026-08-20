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

// Lean first-render payload: the budget grid never renders the session-requirement
// link, so the initial load can skip that heavy nested join. This asserts the lean
// snapshot omits linkedSessionRequirement while keeping every line item, field, and
// total intact, and that the full snapshot still populates the link.
test("getBudgetSnapshot lean mode omits requirement links without hiding rows or changing totals", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-lean-payload");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });

    const session = await harness.createMatrixRow({ eventId, sessionName: "Kickoff" });
    const template = await harness.createSessionRequirementTemplate({ eventId });
    const section = await harness.createSessionRequirementSection({ templateId: template.id, label: "A/V" });
    const item = await harness.createSessionRequirementItem({ sectionId: section.id, label: "Projector" });

    const linked = await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", lineItem: "Projector", forecastCents: 10000, actualCents: 4000, matrixRowId: session.id });
    const plain = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", lineItem: "Lunch", forecastCents: 25000, actualCents: 26000 });
    await harness.createSessionRequirementSelection({ sessionId: session.id, itemId: item.id, budgetLineItemId: linked.id, quantity: 2 });

    // Full snapshot (default) populates the requirement link.
    const full = await getBudgetSnapshot(eventId, { includeSubmissions: false, includeBudgetFiles: false });
    const fullLinked = full.lineItems.find((li) => li.id === linked.id)!;
    assert.equal(fullLinked.linkedSessionRequirement?.requirementItemName, "Projector", "full mode populates the link");
    assert.equal(fullLinked.linkedSessionRequirement?.requirementQuantity, 2, "full mode carries quantity");

    // Lean snapshot omits the link but keeps every row, field, and total.
    const lean = await getBudgetSnapshot(eventId, {
      includeSubmissions: false,
      includeBudgetFiles: false,
      includeLineItemRequirementLinks: false,
    });
    assert.equal(lean.lineItems.length, full.lineItems.length, "lean does not hide rows");
    assert.deepEqual(
      lean.lineItems.map((li) => li.id).sort(),
      [linked.id, plain.id].sort(),
      "same line items present",
    );
    const leanLinked = lean.lineItems.find((li) => li.id === linked.id)!;
    assert.equal(leanLinked.linkedSessionRequirement, null, "lean mode omits the requirement link");
    // Other line-item fields are still present in lean mode.
    assert.equal(leanLinked.forecastCents, 10000, "forecast preserved");
    assert.equal(leanLinked.actualCents, 4000, "actual preserved");
    assert.equal(leanLinked.sessionTitle, "Kickoff", "session title preserved");
    // Totals are identical between lean and full.
    assert.deepEqual(lean.totals, full.totals, "totals unchanged by lean payload");
  } finally {
    await harness.cleanup();
  }
});
