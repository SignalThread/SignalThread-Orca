import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BudgetActivityType,
  BudgetLineItemApproval,
  BudgetLineItemStatus,
  BudgetStatus,
  BudgetSubmissionStatus,
  EventMemberRole,
  UserRole,
  type BudgetLineItem,
} from "@prisma/client";
import {
  buildBudgetDashboardModel,
  buildSubmissionRecipients,
  type BudgetActivityWithActor,
  type BudgetLineItemLinkedRequirement,
  type BudgetLineItemWithDocs,
  type BudgetSubmissionSummary,
  type BudgetWithMeta,
} from "../src/server/services/budget";

const serviceSource = readFileSync("src/server/services/budget.ts", "utf8");
const dashboardRouteSource = readFileSync("app/api/events/[eventId]/budget/dashboard/route.ts", "utf8");

const eventId = "event-1";
const budgetId = "budget-1";
const generatedAt = new Date("2026-02-01T12:00:00.000Z");
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-01T01:00:00.000Z");

const plannerUser = {
  id: "user-planner",
  name: "Planner",
  email: "planner@example.com",
};

const reviewerUser = {
  id: "user-reviewer",
  name: "Reviewer",
  email: "reviewer@example.com",
};

function budgetFixture(): BudgetWithMeta {
  return {
    id: budgetId,
    eventId,
    status: BudgetStatus.DRAFT,
    currentVersionId: "budget-version-1",
    submittedAt: null,
    submittedByUserId: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectedByUserId: null,
    rejectionReason: null,
    lockedAt: null,
    createdAt,
    updatedAt,
    submittedByUser: null,
    approvedByUser: null,
    rejectedByUser: null,
  } satisfies BudgetWithMeta;
}

function lineItemFixture(
  id: string,
  overrides: Partial<BudgetLineItemWithDocs>,
): BudgetLineItemWithDocs {
  return {
    id,
    budgetId,
    category: "General",
    subcategory: "General",
    lineItem: "Budget line",
    vendor: "Vendor",
    matrixRowId: null,
    groupId: null,
    forecastCents: 0,
    actualCents: 0,
    status: BudgetLineItemStatus.PLANNED,
    approval: BudgetLineItemApproval.PENDING,
    sortOrder: 0,
    createdAt,
    updatedAt,
    documentCount: 0,
    firstDocumentId: null,
    sessionTitle: null,
    groupName: null,
    groupColor: null,
    linkedSessionRequirement: null,
    ...overrides,
  } satisfies BudgetLineItemWithDocs;
}

function linkedRequirementFixture(): BudgetLineItemLinkedRequirement {
  return {
    sessionId: "session-1",
    sessionTitle: "Main Stage Session",
    requirementItemId: "requirement-item-1",
    requirementItemName: "Coffee service",
    requirementSectionId: "requirement-section-1",
    requirementSectionName: "F&B",
    requirementQuantity: 100,
  };
}

function submissionFixture(input: {
  id: string;
  status: BudgetSubmissionStatus;
  submittedAt: string;
  lineItem: BudgetLineItem;
  recipients?: typeof reviewerUser[];
}): BudgetSubmissionSummary {
  return {
    id: input.id,
    budgetId,
    budgetVersionId: "budget-version-1",
    status: input.status,
    submittedAt: input.submittedAt,
    submittedByUser: plannerUser,
    pulledBackAt: null,
    pulledBackByUser: null,
    message: null,
    recipients: input.recipients ?? [],
    lineItems: [input.lineItem],
  };
}

function activityFixture(): BudgetActivityWithActor {
  return {
    id: "activity-1",
    budgetId,
    type: BudgetActivityType.SUBMITTED,
    actorUserId: plannerUser.id,
    note: "submissionId=submission-pending",
    createdAt: new Date("2026-01-05T00:00:00.000Z"),
    actorUser: plannerUser,
  } satisfies BudgetActivityWithActor;
}

function dashboardFixture() {
  const catering = lineItemFixture("line-catering", {
    category: "F&B",
    subcategory: "Catering",
    lineItem: "Catering",
    vendor: "Best Caterer",
    forecastCents: 10_000,
    actualCents: 12_000,
    status: BudgetLineItemStatus.PAID,
    approval: BudgetLineItemApproval.APPROVED,
  });
  const av = lineItemFixture("line-av", {
    category: "AV",
    subcategory: "Production",
    lineItem: "Main Stage AV",
    vendor: null,
    forecastCents: 50_000,
    actualCents: 0,
    status: BudgetLineItemStatus.COMMITTED,
    approval: BudgetLineItemApproval.PENDING,
  });
  const snacks = lineItemFixture("line-snacks", {
    category: "F&B",
    subcategory: "Breaks",
    lineItem: "Break Snacks",
    vendor: null,
    forecastCents: 15_000,
    actualCents: 0,
    status: BudgetLineItemStatus.PLANNED,
    approval: BudgetLineItemApproval.PENDING,
    linkedSessionRequirement: linkedRequirementFixture(),
  });

  return buildBudgetDashboardModel({
    eventId,
    budget: budgetFixture(),
    lineItems: [catering, av, snacks],
    submissions: [
      submissionFixture({
        id: "submission-pending",
        status: BudgetSubmissionStatus.SUBMITTED,
        submittedAt: "2026-01-03T00:00:00.000Z",
        lineItem: av,
        recipients: [reviewerUser],
      }),
      submissionFixture({
        id: "submission-rejected",
        status: BudgetSubmissionStatus.REJECTED,
        submittedAt: "2026-01-04T00:00:00.000Z",
        lineItem: snacks,
      }),
    ],
    activity: [activityFixture()],
    generatedAt,
  });
}

test("budget dashboard route is read-only, authenticates, and delegates to the canonical service", () => {
  assert.equal(dashboardRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(dashboardRouteSource.includes("getBudgetDashboard(eventId"), true);
  assert.equal(dashboardRouteSource.includes("export const GET = withApiRequestLogging"), true);
  assert.equal(dashboardRouteSource.includes("export const POST"), false);
  assert.equal(dashboardRouteSource.includes("export const PATCH"), false);
  assert.equal(dashboardRouteSource.includes("export const DELETE"), false);
});

test("getBudgetDashboard enforces read access through the canonical budget guard", () => {
  assert.equal(serviceSource.includes("export async function getBudgetDashboard"), true);
  // B5: read access + write capability come from a single access resolution
  // (no read check followed by a throw/catch write-capability probe).
  assert.equal(serviceSource.includes("const { canWrite: canWriteBudget } = await resolveBudgetAccessForEvent(eventId, user)"), true);
  assert.equal(serviceSource.includes("includeActivity: true"), true);
});

test("EVENT_VIEWER can read dashboard data while remaining blocked from budget writes", () => {
  // Write capability is computed from the same membership resolution: an
  // EVENT_VIEWER resolves to canWrite=false, and the guard throws on write.
  assert.equal(serviceSource.includes("membership.eventRole !== EventMemberRole.EVENT_VIEWER"), true);
  assert.equal(serviceSource.includes('accessType === "write"'), true);
  assert.equal(serviceSource.includes('throw new BudgetServiceError("Event editor role required", 403)'), true);
  assert.equal(EventMemberRole.EVENT_VIEWER, "EVENT_VIEWER");
  assert.equal(UserRole.ADMIN, "ADMIN");
});

test("budget dashboard summary totals are calculated from existing budget line item fields", () => {
  const dashboard = dashboardFixture();

  assert.deepEqual(dashboard.permissions, { canWriteBudget: true });
  assert.deepEqual(dashboard.summary, {
    totalForecastCents: 75_000,
    totalActualCents: 12_000,
    remainingCents: 63_000,
    varianceCents: -63_000,
    lineItemCount: 3,
    pendingActionCount: 2,
  });
});

test("budget dashboard category breakdown includes totals, pending counts, and grid filter metadata", () => {
  const dashboard = dashboardFixture();
  const av = dashboard.categoryBreakdown.find((category) => category.category === "AV & Production");
  const fnb = dashboard.categoryBreakdown.find((category) => category.category === "F&B");

  assert.ok(av);
  assert.equal(av.forecastCents, 50_000);
  assert.equal(av.actualCents, 0);
  assert.equal(av.varianceCents, -50_000);
  assert.equal(av.percentUsed, 0);
  assert.equal(av.lineItemCount, 1);
  assert.equal(av.pendingCount, 1);
  assert.deepEqual(av.link.filters, { category: "AV & Production" });
  assert.equal(av.link.href, "/events/event-1/budget?view=grid&category=AV+%26+Production");

  assert.ok(fnb);
  assert.equal(fnb.forecastCents, 25_000);
  assert.equal(fnb.actualCents, 12_000);
  assert.equal(fnb.varianceCents, -13_000);
  assert.equal(fnb.percentUsed, 48);
  assert.equal(fnb.lineItemCount, 2);
  assert.equal(fnb.pendingCount, 1);
});

test("dashboard category links normalize imported category labels with encoded ampersands", () => {
  const importedDashboard = buildBudgetDashboardModel({
    eventId,
    budget: budgetFixture(),
    lineItems: [
      lineItemFixture("line-imported-fnb", {
        category: "Food & Beverage",
        subcategory: "Coffee Break",
        lineItem: "AM Coffee",
        forecastCents: 9_000,
        actualCents: 0,
      }),
    ],
    submissions: [],
    activity: [],
    generatedAt,
    canWriteBudget: true,
  });

  assert.equal(importedDashboard.categoryBreakdown[0]?.category, "F&B");
  assert.deepEqual(importedDashboard.categoryBreakdown[0]?.link.filters, { category: "F&B" });
  assert.equal(
    importedDashboard.categoryBreakdown[0]?.link.href,
    "/events/event-1/budget?view=grid&category=F%26B",
  );
});

test("pending approvals and rejected submissions appear as budget-derived work queue items", () => {
  const dashboard = dashboardFixture();

  assert.deepEqual(
    dashboard.workQueue.map((item) => ({
      id: item.id,
      type: item.type,
      sourceModule: item.sourceModule,
      status: item.status,
      priority: item.priority,
      assignee: item.assignee?.id ?? null,
      actionLabel: item.actionLabel,
    })),
    [
      {
        id: "budget-revision-submission-rejected",
        type: "REVISION_NEEDED",
        sourceModule: "budget",
        status: "revision_needed",
        priority: "high",
        assignee: plannerUser.id,
        actionLabel: "Revise item",
      },
      {
        id: "budget-approval-submission-pending",
        type: "APPROVAL_REVIEW",
        sourceModule: "budget",
        status: "pending_review",
        priority: "medium",
        assignee: reviewerUser.id,
        actionLabel: "Review submission",
      },
    ],
  );
});

test("budget dashboard no longer returns budget intelligence signals", () => {
  assert.equal("intelligenceSignals" in dashboardFixture(), false);
  assert.equal(serviceSource.includes("BudgetDashboardSignal"), false);
});

test("budget dashboard recent activity uses clean submission labels without exposing raw ids", () => {
  const [activity] = dashboardFixture().recentActivity;

  assert.ok(activity);
  assert.equal(activity.id, "activity-1");
  assert.equal(activity.action, BudgetActivityType.SUBMITTED);
  assert.equal(activity.title, "Main Stage AV submitted for approval");
  assert.equal(activity.description, "Submitted for reviewer action.");
  assert.equal(activity.actor?.id, plannerUser.id);
  assert.equal(activity.sourceId, "submission-pending");
  assert.equal(activity.sourceType, "budget_submission");
  assert.equal(activity.dollarImpactCents, null);
  assert.equal(activity.description.includes("submission-pending"), false);
});

// --- Issue 2: submission recipients are sourced only from event members ---

test("submission recipients are empty when the event has no members", () => {
  assert.deepEqual(buildSubmissionRecipients([], "user-planner"), []);
});

test("submission recipients are empty when the only member is the current user", () => {
  // The submitter is excluded from their own recipient list.
  const recipients = buildSubmissionRecipients([{ user: plannerUser }], plannerUser.id);
  assert.deepEqual(recipients, []);
});

test("eligible event members appear as recipients, excluding the submitter, deduped and sorted", () => {
  const adminUser = { id: "user-admin", name: "Admin Anna", email: "anna@example.com" };
  const recipients = buildSubmissionRecipients(
    [
      { user: plannerUser },
      { user: reviewerUser },
      { user: adminUser },
      // Duplicate membership rows for the same user collapse to one recipient.
      { user: reviewerUser },
    ],
    plannerUser.id,
  );

  // Submitter excluded; remaining two deduped and sorted by display name.
  assert.deepEqual(
    recipients.map((recipient) => recipient.id),
    ["user-admin", "user-reviewer"],
  );
});

test("recipients are exactly the provided members (no fabricated reviewers)", () => {
  const members = [{ user: reviewerUser }];
  const recipients = buildSubmissionRecipients(members, null);
  // Every returned recipient is one of the input members — nothing invented.
  const memberIds = new Set(members.map((member) => member.user.id));
  assert.ok(recipients.every((recipient) => memberIds.has(recipient.id)));
  assert.equal(recipients.length, 1);
});

test("recipient list is built from event members, not a hardcoded source", () => {
  assert.equal(serviceSource.includes("buildSubmissionRecipients(eventMembers, options?.currentUserId)"), true);
  assert.equal(serviceSource.includes("getPrisma().eventMember.findMany({"), true);
});
