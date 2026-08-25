import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  BudgetServiceError,
  assertBudgetAccessForEvent,
  createBudgetSubmission,
  decideBudgetSubmission,
  importLineItems,
  updateLineItem,
} from "@/src/server/services/budget";
import {
  TimelineServiceError,
  listTimelineItems,
  updateTimelineItem,
} from "@/src/server/services/timeline";
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
  return createPlannerFixtureHarness({ runLabel: `prompt2-core-persistence-${randomUUID().slice(0, 8)}` });
}

test("roadmap and budget writes survive fresh reads and enforce event write boundaries", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const roadmapItem = await harness.createTimelineItem({ eventId, title: "Confirm production plan" });

    await updateTimelineItem(eventId, roadmapItem.id, roles.owner.accessUser, {
      status: "IN_PROGRESS",
      workstream: "PRODUCTION",
      planningStage: "PLANNING",
    });

    const freshRoadmapRows = await listTimelineItems(eventId, roles.owner.accessUser, {});
    const freshRoadmapItem = freshRoadmapRows.find((item) => item.id === roadmapItem.id);
    assert.equal(freshRoadmapItem?.status, "IN_PROGRESS");
    assert.equal(freshRoadmapItem?.workstream, "PRODUCTION");
    assert.equal(freshRoadmapItem?.planningStage, "PLANNING");

    await assert.rejects(
      () => updateTimelineItem(eventId, roadmapItem.id, roles.eventViewer.accessUser, { status: "COMPLETE" }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 403,
      "event viewers cannot mutate roadmap rows",
    );

    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: roles.owner.user.id,
      name: "Other scoped event",
    });
    await assert.rejects(
      () => updateTimelineItem(otherEvent.id, roadmapItem.id, roles.owner.accessUser, { status: "COMPLETE" }),
      (error: unknown) => error instanceof TimelineServiceError && error.status === 404,
      "roadmap rows cannot be updated through another event scope",
    );

    const budget = await harness.createBudget({ eventId });
    const imported = await importLineItems(
      eventId,
      [{
        category: "Production",
        subcategory: "Audio",
        lineItem: "Main room audio package",
        forecastCents: 125_000,
        actualCents: 0,
      }],
      { actorUserId: roles.owner.user.id, user: roles.owner.accessUser },
    );
    assert.equal(imported.length, 1);

    await updateLineItem(
      eventId,
      imported[0]!.id,
      { actualCents: 121_500, vendor: "Fixture Audio" },
      { id: roles.owner.user.id },
    );

    await assert.rejects(
      () => assertBudgetAccessForEvent(eventId, roles.eventViewer.accessUser, "write"),
      (error: unknown) => error instanceof BudgetServiceError && error.status === 403,
      "event viewers cannot mutate budget rows",
    );

    const submission = await createBudgetSubmission(eventId, {
      budgetLineItemId: imported[0]!.id,
      recipientUserIds: [roles.member.user.id],
      message: "Approve the imported production line",
      actorUserId: roles.owner.user.id,
    });
    await decideBudgetSubmission(eventId, submission.id, "APPROVED", roles.admin.user.id);

    const [freshBudget, freshLine, freshSubmission] = await Promise.all([
      harness.db.budget.findUniqueOrThrow({ where: { id: budget.id } }),
      harness.db.budgetLineItem.findUniqueOrThrow({ where: { id: imported[0]!.id } }),
      harness.db.budgetSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
    ]);
    assert.equal(freshBudget.status, "APPROVED");
    assert.equal(freshBudget.approvedByUserId, roles.admin.user.id);
    assert.equal(freshLine.actualCents, 121_500);
    assert.equal(freshLine.vendor, "Fixture Audio");
    assert.equal(freshLine.approval, "APPROVED");
    assert.equal(freshSubmission.status, "APPROVED");

    const otherBudget = await harness.createBudget({ eventId: otherEvent.id });
    assert.ok(otherBudget.id);
    await assert.rejects(
      () => updateLineItem(otherEvent.id, imported[0]!.id, { actualCents: 1 }),
      (error: unknown) => error instanceof BudgetServiceError && error.status === 404,
      "budget rows cannot be updated through another event scope",
    );
  } finally {
    await harness.cleanup();
  }
});
