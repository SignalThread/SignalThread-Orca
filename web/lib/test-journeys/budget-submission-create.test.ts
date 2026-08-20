import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { createBudgetSubmission, BudgetServiceError } from "@/src/server/services/budget";
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

// B11 regression: createBudgetSubmission runs its independent pre-transaction
// reads concurrently. This asserts a submission is still created correctly and
// the validation order (line-item existence, then already-submitted) is preserved.
test("createBudgetSubmission creates a submission and preserves validation order", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-submission-create");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });
    const lineItem = await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", lineItem: "Projector", forecastCents: 10000, actualCents: 0 });

    // Unknown line item id → line-item validation error first (404), even though
    // all pre-reads now run concurrently.
    await assert.rejects(
      () =>
        createBudgetSubmission(eventId, {
          budgetLineItemId: randomUUID(),
          recipientUserIds: [roles.member.user.id],
          actorUserId: roles.owner.user.id,
        }),
      (error: unknown) => error instanceof BudgetServiceError && error.status === 404,
      "unknown line item rejected with 404",
    );

    // Valid submission for review.
    const submission = await createBudgetSubmission(eventId, {
      budgetLineItemId: lineItem.id,
      recipientUserIds: [roles.member.user.id],
      message: "Please review",
      actorUserId: roles.owner.user.id,
    });
    assert.equal(submission.status, "SUBMITTED", "submission is submitted");
    assert.equal(submission.submittedByUser?.id, roles.owner.user.id, "submitted by actor");
    assert.equal(submission.message, "Please review", "message persisted");
    assert.equal(
      submission.lineItems.some((li) => li.id === lineItem.id),
      true,
      "submission includes the line item",
    );
    assert.equal(
      submission.recipients.some((r) => r.id === roles.member.user.id),
      true,
      "recipient recorded",
    );

    // Re-submitting the same line item → already-submitted validation (409).
    await assert.rejects(
      () =>
        createBudgetSubmission(eventId, {
          budgetLineItemId: lineItem.id,
          recipientUserIds: [roles.member.user.id],
          actorUserId: roles.owner.user.id,
        }),
      (error: unknown) => error instanceof BudgetServiceError && error.status === 409,
      "already-submitted line item rejected with 409",
    );
  } finally {
    await harness.cleanup();
  }
});
