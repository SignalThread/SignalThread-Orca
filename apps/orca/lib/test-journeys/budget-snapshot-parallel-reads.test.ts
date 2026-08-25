import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { BudgetActivityType, DocumentLinkType } from "@prisma/client";
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

// B1 regression: getBudgetSnapshot now runs its independent reads as one
// concurrent wave (only documentLinks depends on the loaded line items). This
// asserts the payload shape/values are unchanged: ordering, per-line-item
// document metadata, activity, recipients, and totals.
test("getBudgetSnapshot returns an equivalent payload after parallelizing reads", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-snapshot-parallel");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const orgId = roles.organization.id;

    const budget = await harness.createBudget({ eventId });
    const li1 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", lineItem: "Projector", forecastCents: 10000, actualCents: 4000 });
    const li2 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", lineItem: "Lunch", forecastCents: 25000, actualCents: 26000 });
    const li3 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Travel", lineItem: "Flights", forecastCents: 5000, actualCents: 0 });

    // Budget activity (independent read).
    await harness.db.budgetActivity.create({
      data: { budgetId: budget.id, type: BudgetActivityType.SUBMITTED, actorUserId: roles.owner.user.id, note: "Submitted for review" },
    });

    // A document linked to the first line item (documentLinks depends on line item IDs).
    const category = await harness.createDocumentCategory({ eventId });
    const document = await harness.createDocument({ orgId, eventId, categoryId: category.id, title: "AV Quote" });
    await harness.db.documentLink.create({
      data: { documentId: document.id, linkType: DocumentLinkType.BUDGET_ITEM, linkedId: li1.id },
    });

    const snapshot = await getBudgetSnapshot(eventId, {
      currentUserId: roles.owner.user.id,
      includeActivity: true,
      includeRecipients: true,
      includeSubmissions: true,
      includeSubmissionDetails: true,
      includeBudgetFiles: true,
    });

    // Line items preserved and ordered by sortOrder.
    assert.equal(snapshot.budget.id, budget.id, "budget row matches");
    assert.deepEqual(
      snapshot.lineItems.map((item) => item.id),
      [li1.id, li2.id, li3.id],
      "line items in sortOrder",
    );

    // Document metadata attached to the correct line item only.
    const snap1 = snapshot.lineItems.find((item) => item.id === li1.id)!;
    const snap2 = snapshot.lineItems.find((item) => item.id === li2.id)!;
    assert.equal(snap1.documentCount, 1, "linked line item has one document");
    assert.equal(snap1.firstDocumentId, document.id, "linked document id attached");
    assert.equal(snap2.documentCount, 0, "unlinked line item has no documents");

    // Independent-read sections present.
    assert.equal(snapshot.activity.length, 1, "activity read");
    assert.equal(
      snapshot.submissionRecipients.every((recipient) => recipient.id !== roles.owner.user.id),
      true,
      "recipients exclude the current user",
    );

    // Totals equal the sum of all line items.
    assert.equal(snapshot.totals.totalForecastCents, 40000, "forecast total");
    assert.equal(snapshot.totals.totalActualCents, 30000, "actual total");
  } finally {
    // documentLink is created directly; remove it before harness cleanup deletes the document.
    await harness.cleanup();
  }
});
