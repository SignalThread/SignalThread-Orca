import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { TimelinePriority, TimelineStatus, TimelineWorkstream } from "@prisma/client";
import { getEventCommandCenter } from "@/src/server/services/event-command-center";
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

async function createRoadmapTask(
  harness: PlannerFixtureHarness,
  input: {
    eventId: string;
    title: string;
    status: TimelineStatus;
    endDate?: Date | null;
    sortOrder: number;
    parentId?: string | null;
  },
) {
  return harness.db.timelineItem.create({
    data: {
      eventId: input.eventId,
      title: input.title,
      status: input.status,
      priority: TimelinePriority.MEDIUM,
      workstream: TimelineWorkstream.PRODUCTION,
      endDate: input.endDate ?? null,
      sortOrder: input.sortOrder,
      parentId: input.parentId ?? null,
    },
  });
}

test("Event Command Center roadmap progress summarizes all non-root roadmap tasks", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-roadmap-progress");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const today = startOfToday();

    await createRoadmapTask(harness, {
      eventId,
      title: "Event Timeline",
      status: TimelineStatus.IN_PROGRESS,
      sortOrder: 0,
    });
    await createRoadmapTask(harness, {
      eventId,
      title: "Completed venue brief",
      status: TimelineStatus.COMPLETE,
      endDate: addDays(today, -4),
      sortOrder: 1,
    });
    await createRoadmapTask(harness, {
      eventId,
      title: "Overdue production plan",
      status: TimelineStatus.IN_PROGRESS,
      endDate: addDays(today, -2),
      sortOrder: 2,
    });
    await createRoadmapTask(harness, {
      eventId,
      title: "At-risk registration launch",
      status: TimelineStatus.AT_RISK,
      endDate: addDays(today, 8),
      sortOrder: 3,
    });
    await createRoadmapTask(harness, {
      eventId,
      title: "Finalize attendee website",
      status: TimelineStatus.NOT_STARTED,
      endDate: addDays(today, 3),
      sortOrder: 4,
    });
    await createRoadmapTask(harness, {
      eventId,
      title: "Undated speaker follow-up",
      status: TimelineStatus.NOT_STARTED,
      sortOrder: 5,
    });

    const payload = await getEventCommandCenter(eventId);
    const progress = payload.event.roadmapProgress;

    assert.equal(progress.totalTasks, 5, "root Event Timeline is excluded");
    assert.equal(progress.completed, 1);
    assert.equal(progress.inProgress, 1);
    assert.equal(progress.notStarted, 2);
    assert.equal(progress.atRisk, 1);
    assert.equal(progress.percentComplete, 20);
    assert.deepEqual(
      progress.upcomingItems.map((item) => item.title),
      [
        "Overdue production plan",
        "At-risk registration launch",
        "Finalize attendee website",
        "Undated speaker follow-up",
      ],
    );
    assert.equal(progress.upcomingItems[0]?.daysRemaining, -2);
  } finally {
    await harness.cleanup();
  }
});

test("Event Command Center roadmap progress reports empty only when no roadmap tasks exist", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-roadmap-empty");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();

    const payload = await getEventCommandCenter(roles.event.id);
    assert.equal(payload.event.roadmapProgress.totalTasks, 0);
    assert.equal(payload.event.roadmapProgress.percentComplete, 0);
    assert.deepEqual(payload.event.roadmapProgress.upcomingItems, []);
  } finally {
    await harness.cleanup();
  }
});
