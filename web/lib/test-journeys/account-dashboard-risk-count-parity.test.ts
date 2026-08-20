import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  DeadlineCategory,
  DeadlineStatus,
  TimelinePriority,
  TimelineStatus,
  TimelineWorkstream,
  UserRole,
} from "@prisma/client";
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
// Exact copies of the dashboard page helpers/tones the aggregates must mirror.
const NEAR_DUE_DAYS = 7;
function daysFromToday(value: Date, today: Date): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / MS_PER_DAY);
}
function deadlineToneNonNeutral(status: DeadlineStatus, dueAt: Date, today: Date): boolean {
  const daysUntil = daysFromToday(dueAt, today);
  if (status === DeadlineStatus.BLOCKED || daysUntil < 0) return true; // critical
  if (daysUntil <= NEAR_DUE_DAYS) return true; // warning
  return false;
}
function timelineRiskToneNonNeutral(
  item: { status: TimelineStatus; priority: TimelinePriority; endDate: Date | null },
  today: Date,
): boolean {
  if (item.status === TimelineStatus.AT_RISK || item.priority === TimelinePriority.CRITICAL) return true;
  if (item.endDate && item.status !== TimelineStatus.COMPLETE && daysFromToday(item.endDate, today) < 0) return true;
  if (item.priority === TimelinePriority.HIGH) return true;
  return false;
}

// C1 parity: the account dashboard now computes per-event risk/deadline counts as
// DB aggregates instead of re-filtering nested arrays in JS. This test recomputes
// each count from raw rows using the EXACT prior predicates and asserts the
// service's aggregate counts match — locking the aggregate boundaries (calendar
// day cutoff, blocked-predecessor exclusion, risk-set membership) against drift.
test("Account dashboard per-event risk counts match the prior JS predicates exactly", async (t) => {
  const harness = createHarnessOrSkip(t, "account-dashboard-risk-parity");
  if (!harness) return;

  let eventId = "";
  try {
    const roles = await harness.createRoleAccessFixture();
    eventId = roles.event.id;
    const today = startOfToday();
    const nearFuture = addDays(today, 45);

    const mkDeadline = (title: string, status: DeadlineStatus, dueAt: Date) =>
      harness.db.deadline.create({
        data: { eventId, title, status, dueAt, category: DeadlineCategory.OTHER },
      });
    await mkDeadline("dl overdue", DeadlineStatus.OPEN, addDays(today, -3));
    await mkDeadline("dl near", DeadlineStatus.OPEN, addDays(today, 7));
    await mkDeadline("dl mid (in window, not risky)", DeadlineStatus.OPEN, addDays(today, 20));
    await mkDeadline("dl blocked far", DeadlineStatus.BLOCKED, addDays(today, 30));
    await mkDeadline("dl beyond window", DeadlineStatus.OPEN, addDays(today, 60));
    await mkDeadline("dl done", DeadlineStatus.DONE, addDays(today, -1));

    const mkTimeline = (
      title: string,
      status: TimelineStatus,
      priority: TimelinePriority,
      endDate: Date | null,
      sortOrder: number,
    ) =>
      harness.db.timelineItem.create({
        data: { eventId, title, status, priority, endDate, workstream: TimelineWorkstream.PRODUCTION, sortOrder },
      });
    await mkTimeline("ti atrisk", TimelineStatus.AT_RISK, TimelinePriority.MEDIUM, addDays(today, 5), 1);
    await mkTimeline("ti critical", TimelineStatus.NOT_STARTED, TimelinePriority.CRITICAL, addDays(today, 5), 2);
    await mkTimeline("ti overdue", TimelineStatus.IN_PROGRESS, TimelinePriority.HIGH, addDays(today, -2), 3);
    await mkTimeline("ti high future no dep", TimelineStatus.NOT_STARTED, TimelinePriority.HIGH, addDays(today, 5), 4);
    await mkTimeline("ti complete critical", TimelineStatus.COMPLETE, TimelinePriority.CRITICAL, addDays(today, -2), 5);
    const predecessor = await mkTimeline("ti predecessor", TimelineStatus.NOT_STARTED, TimelinePriority.MEDIUM, null, 6);
    const blockedMedium = await mkTimeline("ti blocked medium", TimelineStatus.NOT_STARTED, TimelinePriority.MEDIUM, addDays(today, 5), 7);
    await harness.createTimelineDependency({ eventId, predecessorItemId: predecessor.id, successorItemId: blockedMedium.id });

    // --- Recompute expected counts from raw rows using the prior predicates. ---
    const rawDeadlines = await harness.db.deadline.findMany({ where: { eventId }, select: { status: true, dueAt: true } });
    const inDeadlineSet = (d: { status: DeadlineStatus; dueAt: Date }) =>
      (d.status === DeadlineStatus.OPEN || d.status === DeadlineStatus.BLOCKED) && d.dueAt.getTime() <= nearFuture.getTime();
    const expectedRiskyDeadline = rawDeadlines
      .filter(inDeadlineSet)
      .filter((d) => deadlineToneNonNeutral(d.status, d.dueAt, today)).length;

    const rawTimeline = await harness.db.timelineItem.findMany({
      where: { eventId },
      select: {
        title: true,
        status: true,
        priority: true,
        endDate: true,
        successorDependencies: { select: { predecessor: { select: { status: true } } } },
      },
    });
    const inRiskSet = (item: (typeof rawTimeline)[number]) =>
      item.title !== "Event Timeline" &&
      (item.status === TimelineStatus.AT_RISK ||
        item.priority === TimelinePriority.CRITICAL ||
        (item.endDate !== null && item.endDate.getTime() < today.getTime() && item.status !== TimelineStatus.COMPLETE) ||
        (item.status !== TimelineStatus.COMPLETE &&
          item.successorDependencies.some((dep) => dep.predecessor.status !== TimelineStatus.COMPLETE)));
    const expectedRiskyTimeline = rawTimeline
      .filter(inRiskSet)
      .filter((item) => timelineRiskToneNonNeutral(item, today)).length;
    const expectedOverdueTimeline = rawTimeline.filter(
      (item) =>
        item.title !== "Event Timeline" &&
        item.endDate !== null &&
        item.endDate.getTime() < today.getTime() &&
        item.status !== TimelineStatus.COMPLETE,
    ).length;
    const expectedAtRiskTimeline = rawTimeline.filter(
      (item) =>
        item.title !== "Event Timeline" &&
        (item.status === TimelineStatus.AT_RISK || item.priority === TimelinePriority.CRITICAL),
    ).length;

    const data = await getCommandCenterDashboardData({
      orgId: roles.organization.id,
      appUserId: roles.owner.user.id,
      role: UserRole.OWNER,
      today,
      nearFuture,
    });
    const event = data.events.find((e) => e.id === eventId)!;

    assert.equal(event.riskyDeadlineCount, expectedRiskyDeadline, "riskyDeadlineCount matches prior predicate");
    assert.equal(event.riskyTimelineCount, expectedRiskyTimeline, "riskyTimelineCount matches prior predicate");
    assert.equal(event.overdueTimelineCount, expectedOverdueTimeline, "overdueTimelineCount matches prior predicate");
    assert.equal(event.atRiskTimelineCount, expectedAtRiskTimeline, "atRiskTimelineCount matches prior predicate");

    // Sanity on the concrete fixture, confirming the interesting boundary cases:
    // mid/beyond/done deadlines excluded; complete-critical is not overdue but is
    // at-risk; blocked-medium is in the risk set but tone-neutral so not risky.
    assert.equal(expectedRiskyDeadline, 3, "fixture: risky = overdue + near + blocked-far");
    assert.equal(expectedOverdueTimeline, 1, "fixture: 1 overdue timeline item");
    assert.equal(expectedAtRiskTimeline, 3, "fixture: at-risk + 2 critical");
    assert.equal(expectedRiskyTimeline, 4, "fixture: atrisk, critical, overdue-high, complete-critical");
  } finally {
    await harness.db.deadline.deleteMany({ where: { eventId } });
    await harness.cleanup();
  }
});

// C1 parity: the two dashboard "top" lists are bounded to 12 at the DB and remain
// correctly ordered (nearest due / earliest end date first).
test("Account dashboard top deadline/risk lists are bounded to 12 and ordered", async (t) => {
  const harness = createHarnessOrSkip(t, "account-dashboard-top-lists");
  if (!harness) return;

  let eventId = "";
  try {
    const roles = await harness.createRoleAccessFixture();
    eventId = roles.event.id;
    const today = startOfToday();
    const nearFuture = addDays(today, 45);

    // 15 open deadlines within the window at increasing due dates.
    for (let i = 0; i < 15; i += 1) {
      await harness.db.deadline.create({
        data: {
          eventId,
          title: `DL ${String(i).padStart(2, "0")}`,
          status: DeadlineStatus.OPEN,
          dueAt: addDays(today, i + 1),
          category: DeadlineCategory.OTHER,
        },
      });
    }
    // 15 critical timeline risks at increasing end dates BEYOND the 45-day deadline
    // window, so they populate the risk list but not the timeline-derived deadlines.
    for (let i = 0; i < 15; i += 1) {
      await harness.db.timelineItem.create({
        data: {
          eventId,
          title: `TI ${String(i).padStart(2, "0")}`,
          status: TimelineStatus.NOT_STARTED,
          priority: TimelinePriority.CRITICAL,
          endDate: addDays(today, 50 + i),
          workstream: TimelineWorkstream.PRODUCTION,
          sortOrder: i + 1,
        },
      });
    }

    const data = await getCommandCenterDashboardData({
      orgId: roles.organization.id,
      appUserId: roles.owner.user.id,
      role: UserRole.OWNER,
      today,
      nearFuture,
    });

    assert.equal(data.deadlines.length, 12, "deadline list bounded to 12");
    assert.equal(data.timelineRisks.length, 12, "timeline risk list bounded to 12");
    // Nearest-due first: the earliest deadlines are the ones surfaced.
    assert.deepEqual(
      data.deadlines.map((d) => d.title),
      Array.from({ length: 12 }, (_, i) => `DL ${String(i).padStart(2, "0")}`),
      "deadlines ordered by nearest due date",
    );
    assert.deepEqual(
      data.timelineRisks.map((r) => r.title),
      Array.from({ length: 12 }, (_, i) => `TI ${String(i).padStart(2, "0")}`),
      "timeline risks ordered by earliest end date",
    );
  } finally {
    await harness.db.deadline.deleteMany({ where: { eventId } });
    await harness.cleanup();
  }
});
