import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { TimelinePriority, TimelineStatus, TimelineWorkstream, UserRole } from "@prisma/client";
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

// C1 regression: the account dashboard no longer loads dependency edges for every
// risk timeline item across every event. successorDependencies are fetched only
// for the displayed (top-12) timeline risks, while per-event risk items are still
// returned for the page's per-event counts.
test("Account dashboard attaches successor dependencies to displayed timeline risks only", async (t) => {
  const harness = createHarnessOrSkip(t, "account-dashboard-risk-deps");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const today = startOfToday();

    // Predecessor (incomplete) blocks an at-risk successor task.
    const predecessor = await harness.db.timelineItem.create({
      data: {
        eventId,
        title: "Predecessor Task",
        status: TimelineStatus.NOT_STARTED,
        priority: TimelinePriority.MEDIUM,
        workstream: TimelineWorkstream.PRODUCTION,
        sortOrder: 1,
      },
    });
    const atRisk = await harness.db.timelineItem.create({
      data: {
        eventId,
        title: "At Risk Task",
        status: TimelineStatus.AT_RISK,
        priority: TimelinePriority.HIGH,
        workstream: TimelineWorkstream.PRODUCTION,
        sortOrder: 2,
      },
    });
    await harness.createTimelineDependency({
      eventId,
      predecessorItemId: predecessor.id,
      successorItemId: atRisk.id,
    });

    const data = await getCommandCenterDashboardData({
      orgId: roles.organization.id,
      appUserId: roles.owner.user.id,
      role: UserRole.OWNER,
      today,
      nearFuture: today,
    });

    // The displayed timeline risk carries its blocked-predecessor dependency.
    const risk = data.timelineRisks.find((item) => item.id === atRisk.id);
    assert.ok(risk, "at-risk item appears in the displayed timeline risks");
    assert.equal(risk.successorDependencies.length, 1, "one successor dependency attached");
    assert.equal(
      risk.successorDependencies[0].predecessor.status,
      TimelineStatus.NOT_STARTED,
      "blocked predecessor status attached for the displayed risk",
    );

    // Per-event risk counts are now DB aggregates on the event (C1: no nested
    // timelineItem arrays). The AT_RISK/HIGH item is counted; the incomplete
    // predecessor (no risk signal, no endDate) is not.
    const event = data.events.find((e) => e.id === eventId)!;
    assert.equal(event.atRiskTimelineCount, 1, "AT_RISK item counted in atRiskTimelineCount");
    assert.equal(event.riskyTimelineCount, 1, "AT_RISK/HIGH item counted in riskyTimelineCount");
    assert.equal(event.overdueTimelineCount, 0, "no overdue items (no past endDate)");
  } finally {
    await harness.cleanup();
  }
});
