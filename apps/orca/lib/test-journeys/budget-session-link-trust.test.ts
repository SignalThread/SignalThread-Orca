import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { SessionRequirementError, updateSessionRequirementBudgetLink } from "@/lib/session-requirements";
import { createBudgetSubmission } from "@/src/server/services/budget";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `budget-session-trust-${randomUUID().slice(0, 8)}` });
}

test("explicit requirement links establish one canonical session and reject cross-session reuse", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const [sessionA, sessionB] = await Promise.all([
      harness.createMatrixRow({ eventId, sessionName: "Session A" }),
      harness.createMatrixRow({ eventId, sessionName: "Session B" }),
    ]);
    const budget = await harness.createBudget({ eventId });
    const line = await harness.createBudgetLineItem({
      budgetId: budget.id,
      category: "F&B",
      lineItem: "Session catering",
      matrixRowId: null,
    });
    const template = await harness.createSessionRequirementTemplate({ eventId });
    const section = await harness.createSessionRequirementSection({ templateId: template.id, key: "fnb", label: "F&B" });
    const [itemA, itemB] = await Promise.all([
      harness.createSessionRequirementItem({ sectionId: section.id, key: "a" }),
      harness.createSessionRequirementItem({ sectionId: section.id, key: "b" }),
    ]);

    await updateSessionRequirementBudgetLink({ eventId, sessionId: sessionA.id, itemId: itemA.id, budgetLineItemId: line.id });
    await updateSessionRequirementBudgetLink({ eventId, sessionId: sessionA.id, itemId: itemA.id, budgetLineItemId: line.id });

    const freshLine = await harness.db.budgetLineItem.findUniqueOrThrow({ where: { id: line.id } });
    assert.equal(freshLine.matrixRowId, sessionA.id);
    assert.equal(await harness.db.sessionRequirementSelection.count({ where: { budgetLineItemId: line.id } }), 1);

    await assert.rejects(
      () => updateSessionRequirementBudgetLink({ eventId, sessionId: sessionB.id, itemId: itemB.id, budgetLineItemId: line.id }),
      (error: unknown) => error instanceof SessionRequirementError && error.status === 409,
    );
    assert.equal(await harness.db.sessionRequirementSelection.count({ where: { budgetLineItemId: line.id } }), 1);

    await updateSessionRequirementBudgetLink({ eventId, sessionId: sessionA.id, itemId: itemA.id, budgetLineItemId: null });
    const unlinkedRequirement = await harness.db.sessionRequirementSelection.findUniqueOrThrow({
      where: { sessionId_itemId: { sessionId: sessionA.id, itemId: itemA.id } },
    });
    assert.equal(unlinkedRequirement.budgetLineItemId, null);
    assert.equal((await harness.db.budgetLineItem.findUniqueOrThrow({ where: { id: line.id } })).matrixRowId, sessionA.id);
  } finally {
    await harness.cleanup();
  }
});

test("repeated approval submissions return the existing conflict contract without duplicates", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const budget = await harness.createBudget({ eventId: roles.event.id });
    const line = await harness.createBudgetLineItem({ budgetId: budget.id, lineItem: "Duplicate-safe line" });
    const input = {
      budgetLineItemId: line.id,
      recipientUserIds: [roles.member.user.id],
      actorUserId: roles.owner.user.id,
    };

    await createBudgetSubmission(roles.event.id, input);
    await assert.rejects(
      () => createBudgetSubmission(roles.event.id, input),
      (error: unknown) => (error as { status?: number }).status === 409,
    );
    assert.equal(await harness.db.budgetSubmissionLineItem.count({ where: { budgetLineItemId: line.id } }), 1);
  } finally {
    await harness.cleanup();
  }
});
