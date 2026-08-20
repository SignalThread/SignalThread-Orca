import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { DocumentStatus, UserRole } from "@prisma/client";
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

// P2-8 regression: the account APPROVALS KPI is cross-module, so it must include
// portfolio documents in review alongside budget approvals/submissions.
test("Account approvals rollup includes documents in review plus budget approvals", async (t) => {
  const harness = createHarnessOrSkip(t, "account-approvals-docs");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const orgId = roles.organization.id;
    const eventId = roles.event.id;
    const today = startOfToday();

    // Budget with a pending line-item approval (default approval is PENDING).
    const budget = await harness.createBudget({ eventId });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", forecastCents: 1000, actualCents: 0 });

    // Documents: one in review (counts), one draft (must not count).
    const category = await harness.createDocumentCategory({ eventId });
    await harness.createDocument({ orgId, eventId, categoryId: category.id, status: DocumentStatus.IN_REVIEW });
    await harness.createDocument({ orgId, eventId, categoryId: category.id, status: DocumentStatus.DRAFT });

    const data = await getCommandCenterDashboardData({
      orgId,
      appUserId: roles.owner.user.id,
      role: UserRole.OWNER,
      today,
      nearFuture: today,
    });

    // Only IN_REVIEW documents are counted.
    assert.equal(data.documentsInReviewCount, 1, "one document in review");
    // Budget approvals still counted.
    assert.equal(data.budgetPendingApprovalCount, 1, "pending budget approval preserved");

    // The combined account approvals count (as composed by the page) includes both.
    const submittedBudgetSubmissionCount = data.submittedBudgetSubmissionCounts.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );
    const approvalsCount =
      data.budgetPendingApprovalCount + submittedBudgetSubmissionCount + data.documentsInReviewCount;
    assert.equal(approvalsCount, 2, "approvals = budget pending + submissions + docs in review");
  } finally {
    await harness.cleanup();
  }
});

// Docs-only case: an event with a document in review and no budget approvals must
// still report a non-zero account approvals count.
test("Account approvals count is non-zero from documents in review alone", async (t) => {
  const harness = createHarnessOrSkip(t, "account-approvals-docs-only");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const orgId = roles.organization.id;
    const eventId = roles.event.id;
    const today = startOfToday();

    const category = await harness.createDocumentCategory({ eventId });
    await harness.createDocument({ orgId, eventId, categoryId: category.id, status: DocumentStatus.IN_REVIEW });

    const data = await getCommandCenterDashboardData({
      orgId,
      appUserId: roles.owner.user.id,
      role: UserRole.OWNER,
      today,
      nearFuture: today,
    });

    assert.equal(data.budgetPendingApprovalCount, 0, "no budget approvals");
    assert.equal(data.documentsInReviewCount, 1, "one document in review");
    const submittedBudgetSubmissionCount = data.submittedBudgetSubmissionCounts.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );
    const approvalsCount =
      data.budgetPendingApprovalCount + submittedBudgetSubmissionCount + data.documentsInReviewCount;
    assert.equal(approvalsCount > 0, true, "approvals non-zero from docs alone");
  } finally {
    await harness.cleanup();
  }
});
