import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
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

// P0-1 regression: the Account Command Center deadline rollup must reflect real
// TimelineItem.endDate data even when no Deadline rows exist, mirroring the
// event-level Command Center. Previously it read only the unpopulated Deadline
// table and reported a false "0 / Clear" state.
test("Account Command Center sources deadlines from TimelineItem when no Deadline rows exist", async (t) => {
  const harness = createHarnessOrSkip(t, "account-cc-deadlines");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const today = startOfToday();
    const nearFuture = addDays(today, 45);

    // Overdue, incomplete timeline item — should count as an overdue deadline.
    await harness.db.timelineItem.create({
      data: {
        eventId,
        title: "Overdue Vendor Contract",
        status: TimelineStatus.IN_PROGRESS,
        priority: TimelinePriority.HIGH,
        workstream: TimelineWorkstream.PRODUCTION,
        endDate: addDays(today, -5),
        sortOrder: 1,
      },
    });
    // Upcoming, incomplete timeline item within the lookahead window.
    await harness.db.timelineItem.create({
      data: {
        eventId,
        title: "Upcoming Signage Proof",
        status: TimelineStatus.NOT_STARTED,
        priority: TimelinePriority.MEDIUM,
        workstream: TimelineWorkstream.PRODUCTION,
        endDate: addDays(today, 10),
        sortOrder: 2,
      },
    });
    // Complete item within the window — must be excluded from deadlines.
    await harness.db.timelineItem.create({
      data: {
        eventId,
        title: "Finished Kickoff Deck",
        status: TimelineStatus.COMPLETE,
        priority: TimelinePriority.MEDIUM,
        workstream: TimelineWorkstream.PRODUCTION,
        endDate: addDays(today, 3),
        sortOrder: 3,
      },
    });

    const data = await getCommandCenterDashboardData({
      orgId: roles.organization.id,
      appUserId: roles.owner.user.id,
      role: UserRole.OWNER,
      today,
      nearFuture,
    });

    const titles = data.deadlines.map((deadline) => deadline.title);
    // Panel/KPI/list receive non-empty timeline-derived deadline data.
    assert.equal(data.deadlines.length >= 2, true, "deadlines should be non-empty");
    assert.equal(titles.includes("Overdue Vendor Contract"), true, "overdue timeline item present");
    assert.equal(titles.includes("Upcoming Signage Proof"), true, "upcoming timeline item present");
    // Completed items are excluded.
    assert.equal(titles.includes("Finished Kickoff Deck"), false, "complete item excluded");
    // Timeline-derived deadlines carry the timeline- id prefix (no Deadline rows).
    assert.equal(
      data.deadlines.every((deadline) => deadline.id.startsWith("timeline-")),
      true,
      "all deadlines are timeline-derived",
    );
    // Overdue KPI count is sourced from the portfolio-level actionable rollup,
    // not the bounded display list.
    const overdueCount = data.deadlines.filter(
      (deadline) => deadline.dueAt.getTime() < today.getTime(),
    ).length;
    assert.equal(overdueCount, 1, "exactly one overdue deadline");
    assert.equal(data.overdueActionableCount, 1, "exactly one overdue actionable item");
  } finally {
    await harness.cleanup();
  }
});
