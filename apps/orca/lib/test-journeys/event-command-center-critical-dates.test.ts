import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  DeadlineCategory,
  DeadlineStatus,
  TimelinePriority,
  TimelineStatus,
  TimelineWorkstream,
} from "@prisma/client";
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

async function createDeadline(
  harness: PlannerFixtureHarness,
  input: {
    eventId: string;
    title: string;
    dueAt: Date;
    status?: DeadlineStatus;
  },
) {
  return harness.db.deadline.create({
    data: {
      eventId: input.eventId,
      title: input.title,
      dueAt: input.dueAt,
      status: input.status ?? DeadlineStatus.OPEN,
      category: DeadlineCategory.LOGISTICS,
    },
  });
}

async function createTimelineMilestone(
  harness: PlannerFixtureHarness,
  input: {
    eventId: string;
    title: string;
    endDate: Date;
    priority?: TimelinePriority;
    status?: TimelineStatus;
    isCriticalPath?: boolean;
    sortOrder?: number;
  },
) {
  return harness.db.timelineItem.create({
    data: {
      eventId: input.eventId,
      title: input.title,
      status: input.status ?? TimelineStatus.NOT_STARTED,
      priority: input.priority ?? TimelinePriority.HIGH,
      isCriticalPath: input.isCriticalPath ?? false,
      workstream: TimelineWorkstream.PRODUCTION,
      endDate: input.endDate,
      sortOrder: input.sortOrder ?? 1,
    },
  });
}

test("Event Command Center critical dates include scoped incomplete deadlines and exclude closed records", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-critical-dates");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const today = startOfToday();
    const eventId = roles.event.id;
    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      createdByUserId: roles.owner.user.id,
      name: "Other Critical Dates Event",
    });

    await createDeadline(harness, {
      eventId,
      title: "Upcoming registration launch",
      dueAt: addDays(today, 4),
    });
    await createDeadline(harness, {
      eventId,
      title: "Overdue venue contract",
      dueAt: addDays(today, -2),
      status: DeadlineStatus.BLOCKED,
    });
    await createDeadline(harness, {
      eventId,
      title: "Finished sponsor deck",
      dueAt: addDays(today, -1),
      status: DeadlineStatus.DONE,
    });
    await createDeadline(harness, {
      eventId,
      title: "Canceled rooming list",
      dueAt: addDays(today, 1),
      status: DeadlineStatus.CANCELED,
    });
    await createDeadline(harness, {
      eventId: otherEvent.id,
      title: "Other event deadline",
      dueAt: addDays(today, -1),
    });

    const payload = await getEventCommandCenter(eventId);
    const titles = payload.event.deadlines.map((deadline) => deadline.title);

    assert.deepEqual(titles.slice(0, 2), [
      "Overdue venue contract",
      "Upcoming registration launch",
    ]);
    assert.equal(titles.includes("Finished sponsor deck"), false, "completed deadline excluded");
    assert.equal(titles.includes("Canceled rooming list"), false, "canceled deadline excluded");
    assert.equal(titles.includes("Other event deadline"), false, "other event deadline excluded");
    assert.equal(payload.event.deadlines[0]?.status, "overdue");
    assert.equal(payload.event.deadlines[1]?.status, "upcoming");
  } finally {
    await harness.cleanup();
  }
});

test("Event Command Center critical dates rank timeline milestones, de-dupe against deadlines, and retain view-all candidates", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-critical-date-rank");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const today = startOfToday();
    const eventId = roles.event.id;

    await createDeadline(harness, {
      eventId,
      title: "Deadline wins duplicate",
      dueAt: addDays(today, 6),
    });
    await createTimelineMilestone(harness, {
      eventId,
      title: "Deadline wins duplicate",
      endDate: addDays(today, 6),
      priority: TimelinePriority.CRITICAL,
    });
    await createTimelineMilestone(harness, {
      eventId,
      title: "Overdue high milestone",
      endDate: addDays(today, -3),
      priority: TimelinePriority.HIGH,
      status: TimelineStatus.IN_PROGRESS,
      sortOrder: 2,
    });
    await createTimelineMilestone(harness, {
      eventId,
      title: "Upcoming critical milestone",
      endDate: addDays(today, 5),
      priority: TimelinePriority.CRITICAL,
      sortOrder: 3,
    });
    await createTimelineMilestone(harness, {
      eventId,
      title: "Upcoming high milestone",
      endDate: addDays(today, 4),
      priority: TimelinePriority.HIGH,
      sortOrder: 4,
    });
    await createTimelineMilestone(harness, {
      eventId,
      title: "Due today boundary milestone",
      endDate: today,
      priority: TimelinePriority.HIGH,
      sortOrder: 5,
    });
    await createTimelineMilestone(harness, {
      eventId,
      title: "Completed critical milestone",
      endDate: addDays(today, -1),
      priority: TimelinePriority.CRITICAL,
      status: TimelineStatus.COMPLETE,
      sortOrder: 6,
    });
    for (let index = 0; index < 5; index += 1) {
      await createDeadline(harness, {
        eventId,
        title: `Additional open date ${index + 1}`,
        dueAt: addDays(today, 10 + index),
      });
    }

    const payload = await getEventCommandCenter(eventId);
    const titles = payload.event.deadlines.map((deadline) => deadline.title);

    assert.equal(payload.event.deadlines.length, 8, "payload retains more than five dates for View all");
    assert.deepEqual(titles.slice(0, 4), [
      "Overdue high milestone",
      "Upcoming critical milestone",
      "Due today boundary milestone",
      "Upcoming high milestone",
    ]);
    assert.equal(
      titles.filter((title) => title === "Deadline wins duplicate").length,
      1,
      "Deadline and TimelineItem duplicate is shown once",
    );
    assert.equal(titles.includes("Completed critical milestone"), false, "completed timeline item excluded");
    assert.equal(
      payload.event.deadlines.find((deadline) => deadline.title === "Due today boundary milestone")?.status,
      "upcoming",
      "date-only today is not treated as overdue",
    );
  } finally {
    await harness.cleanup();
  }
});

test("Event Command Center critical dates empty state has no false positives", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-critical-date-empty");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const today = startOfToday();

    await createDeadline(harness, {
      eventId: roles.event.id,
      title: "Done-only deadline",
      dueAt: addDays(today, 1),
      status: DeadlineStatus.DONE,
    });
    await createTimelineMilestone(harness, {
      eventId: roles.event.id,
      title: "Completed-only milestone",
      endDate: addDays(today, 1),
      priority: TimelinePriority.CRITICAL,
      status: TimelineStatus.COMPLETE,
    });

    const payload = await getEventCommandCenter(roles.event.id);
    assert.equal(payload.event.deadlines.length, 0);
  } finally {
    await harness.cleanup();
  }
});
