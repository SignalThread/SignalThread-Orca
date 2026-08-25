import assert from "node:assert/strict";
import test from "node:test";
import {
  TaskActivityType,
  TaskLinkObjectType,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
} from "@prisma/client";
import {
  createTaskService,
  TaskServiceError,
  type TaskServiceUser,
} from "@/src/server/services/tasks";

/* eslint-disable @typescript-eslint/no-explicit-any -- This in-memory Prisma test double intentionally accepts the generated delegates' dynamic argument shapes. */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const EVENT_A = uuid(10);
const EVENT_B = uuid(11);
const EVENT_OTHER_ORG = uuid(12);
const EDITOR = uuid(21);
const VIEWER = uuid(22);
const OUTSIDER = uuid(23);
const BUDGET_A = uuid(30);
const BUDGET_B = uuid(31);

type FakeUser = {
  id: string;
  orgId: string;
  role: UserRole;
  eventIds: string[];
};

function pick<T extends Record<string, unknown>>(row: T | null, select?: Record<string, unknown>): Partial<T> | null {
  if (!row || !select) return row;
  const out: Partial<T> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key as keyof T] = row[key as keyof T];
  }
  return out;
}

class FakePrisma {
  events = [
    { id: EVENT_A, orgId: ORG_A, clientId: null, name: "Event A" },
    { id: EVENT_B, orgId: ORG_A, clientId: null, name: "Event B" },
    { id: EVENT_OTHER_ORG, orgId: ORG_B, clientId: null, name: "Other Org Event" },
  ];

  users: FakeUser[] = [
    { id: EDITOR, orgId: ORG_A, role: UserRole.MEMBER, eventIds: [EVENT_A, EVENT_B] },
    { id: VIEWER, orgId: ORG_A, role: UserRole.MEMBER, eventIds: [EVENT_A] },
    { id: OUTSIDER, orgId: ORG_B, role: UserRole.MEMBER, eventIds: [EVENT_OTHER_ORG] },
  ];

  budgets = [
    { id: BUDGET_A, status: "DRAFT", eventId: EVENT_A },
    { id: BUDGET_B, status: "DRAFT", eventId: EVENT_B },
  ];

  tasks: Array<Record<string, any>> = [];
  assignments: Array<Record<string, any>> = [];
  links: Array<Record<string, any>> = [];
  comments: Array<Record<string, any>> = [];
  activity: Array<Record<string, any>> = [];
  watchers: Array<Record<string, any>> = [];
  notifications: Array<Record<string, any>> = [];
  moduleUpdateCalls: string[] = [];
  private sequence = 100;

  $transaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => fn(this);

  event = {
    findUnique: async ({ where, select }: any) => pick(this.events.find((row) => row.id === where.id) ?? null, select),
    findFirst: async ({ where, select }: any) => pick(this.events.find((row) => row.id === where.id) ?? null, select),
  };

  user = {
    findFirst: async ({ where }: any) => {
      const user = this.users.find((row) => row.id === where.id && row.orgId === where.orgId);
      if (!user) return null;
      const eventId = where.OR?.[1]?.eventMemberships?.some?.eventId;
      if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN || user.eventIds.includes(eventId)) {
        return { id: user.id };
      }
      return null;
    },
  };

  task = {
    create: async ({ data, select }: any) => {
      const now = new Date("2026-06-14T12:00:00.000Z");
      const row = {
        id: uuid(this.sequence++),
        status: TaskStatus.OPEN,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        completedByUserId: null,
        canceledAt: null,
        canceledByUserId: null,
        ...data,
      };
      this.tasks.push(row);
      return pick(row, select) ?? row;
    },
    findUnique: async ({ where, select, include }: any) => {
      const row = this.tasks.find((task) => task.id === where.id) ?? null;
      if (include) return row ? this.hydrateTask(row) : null;
      return pick(row, select) ?? row;
    },
    findMany: async ({ where }: any) => {
      return this.tasks
        .filter((task) => {
          if (where.orgId && task.orgId !== where.orgId) return false;
          if (where.eventId && task.eventId !== where.eventId) return false;
          if (where.source && task.source !== where.source) return false;
          if (where.visibility && task.visibility !== where.visibility) return false;
          if (where.status && task.status !== where.status) return false;
          if (where.priority && task.priority !== where.priority) return false;
          if (where.type && task.type !== where.type) return false;
          if (where.assignments?.some?.userId) {
            const hasAssignee = this.assignments.some(
              (assignment) => assignment.taskId === task.id && assignment.userId === where.assignments.some.userId,
            );
            if (!hasAssignee) return false;
          }
          if (where.links?.some) {
            const hasLink = this.links.some(
              (link) =>
                link.taskId === task.id &&
                link.objectType === where.links.some.objectType &&
                link.objectId === where.links.some.objectId,
            );
            if (!hasLink) return false;
          }
          return true;
        })
        .map((task) => this.hydrateTask(task));
    },
    update: async ({ where, data }: any) => {
      const row = this.tasks.find((task) => task.id === where.id);
      if (!row) throw new Error("Task not found");
      Object.assign(row, data, { updatedAt: new Date("2026-06-14T12:01:00.000Z") });
      return row;
    },
  };

  taskAssignment = {
    findUnique: async ({ where }: any) =>
      this.assignments.find(
        (assignment) =>
          assignment.taskId === where.taskId_userId.taskId && assignment.userId === where.taskId_userId.userId,
      ) ?? null,
    create: async ({ data }: any) => {
      this.assignments.push({ ...data, role: data.role ?? "OWNER", createdAt: new Date() });
      return data;
    },
  };

  taskLink = {
    findFirst: async ({ where }: any) =>
      this.links.find(
        (link) =>
          link.taskId === where.taskId &&
          link.objectType === where.objectType &&
          link.objectId === where.objectId,
      ) ?? null,
    create: async ({ data }: any) => {
      const row = { id: uuid(this.sequence++), createdAt: new Date(), ...data };
      this.links.push(row);
      return row;
    },
  };

  taskComment = {
    create: async ({ data }: any) => {
      const row = { id: uuid(this.sequence++), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...data };
      this.comments.push(row);
      return row;
    },
  };

  taskActivity = {
    create: async ({ data }: any) => {
      const row = { id: uuid(this.sequence++), createdAt: new Date(), ...data };
      this.activity.push(row);
      return row;
    },
  };

  taskWatcher = {
    findUnique: async ({ where }: any) =>
      this.watchers.find(
        (watcher) => watcher.taskId === where.taskId_userId.taskId && watcher.userId === where.taskId_userId.userId,
      ) ?? null,
    create: async ({ data }: any) => {
      const row = { createdAt: new Date(), ...data };
      this.watchers.push(row);
      return row;
    },
    delete: async ({ where }: any) => {
      const index = this.watchers.findIndex(
        (watcher) => watcher.taskId === where.taskId_userId.taskId && watcher.userId === where.taskId_userId.userId,
      );
      if (index >= 0) this.watchers.splice(index, 1);
      return null;
    },
  };

  notification = {
    create: async ({ data }: any) => {
      const row = { id: uuid(this.sequence++), isRead: false, createdAt: new Date(), readAt: null, ...data };
      this.notifications.push(row);
      return row;
    },
  };

  budget = {
    findFirst: async ({ where }: any) => {
      const budget = this.budgets.find((row) => row.id === where.id);
      if (!budget) return null;
      const event = this.events.find((row) => row.id === budget.eventId);
      return event ? { id: budget.id, event: { id: event.id, orgId: event.orgId, clientId: event.clientId, name: event.name } } : null;
    },
    update: async () => {
      this.moduleUpdateCalls.push("budget.update");
      throw new Error("Budget should not be updated by task service");
    },
  };

  budgetLineItem = { findFirst: async () => null };
  budgetSubmission = { findFirst: async () => null };
  document = { findFirst: async () => null };
  documentVersion = { findFirst: async () => null };
  deadline = { findFirst: async () => null };
  timelineItem = { findFirst: async () => null };
  matrixRow = { findFirst: async () => null };
  sessionFnbCatalogAssignment = { findFirst: async () => null };
  seatingPlan = { findFirst: async () => null };
  seatingTable = { findFirst: async () => null };
  seatingAssignment = { findFirst: async () => null };
  speaker = { findFirst: async () => null };
  speakerProfileSubmission = { findFirst: async () => null };
  speakerDocumentRequest = { findFirst: async () => null };
  speakerFile = { findFirst: async () => null };

  private hydrateTask(task: Record<string, any>) {
    return {
      ...task,
      assignments: this.assignments.filter((assignment) => assignment.taskId === task.id),
      links: this.links.filter((link) => link.taskId === task.id),
      comments: this.comments.filter((comment) => comment.taskId === task.id && !comment.deletedAt),
      activity: this.activity.filter((activity) => activity.taskId === task.id),
      watchers: this.watchers.filter((watcher) => watcher.taskId === task.id),
    };
  }
}

function makeService() {
  const prisma = new FakePrisma();
  const accessCalls: Array<{ eventId: string; userId: string; accessType: string }> = [];
  const service = createTaskService({
    prisma: prisma as any,
    now: () => new Date("2026-06-14T13:00:00.000Z"),
    assertEventAccess: async (eventId, user, accessType) => {
      accessCalls.push({ eventId, userId: user.id, accessType });
      const event = prisma.events.find((row) => row.id === eventId);
      if (!event) throw new TaskServiceError("Event not found", 404);
      if (user.role !== UserRole.SUPER_ADMIN && user.orgId !== event.orgId) {
        throw new TaskServiceError("Event is outside the active organization scope", 403, "EVENT_OUTSIDE_ACTIVE_ORG");
      }
      if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
        return;
      }
      const fakeUser = prisma.users.find((row) => row.id === user.id);
      if (!fakeUser?.eventIds.includes(eventId)) {
        throw new TaskServiceError("Event membership required", 403, "EVENT_MEMBERSHIP_REQUIRED");
      }
      if (accessType === "write" && user.id === VIEWER) {
        throw new TaskServiceError("Event editor role required", 403, "EVENT_EDITOR_ROLE_REQUIRED");
      }
    },
  });
  return { prisma, service, accessCalls };
}

const editor: TaskServiceUser = { id: EDITOR, orgId: ORG_A, role: UserRole.MEMBER };
const viewer: TaskServiceUser = { id: VIEWER, orgId: ORG_A, role: UserRole.MEMBER };
const outsider: TaskServiceUser = { id: OUTSIDER, orgId: ORG_B, role: UserRole.MEMBER };

async function seedTask() {
  const harness = makeService();
  const task = await harness.service.createManualTask(editor, {
    eventId: EVENT_A,
    title: "Confirm banquet count",
  });
  return { ...harness, task };
}

test("create manual event task scopes org/client from event and writes create activity", async () => {
  const { prisma, service, accessCalls } = makeService();

  const task = await service.createManualTask(editor, {
    eventId: EVENT_A,
    title: " Confirm banquet count ",
    description: "Manual ops follow-up",
    priority: TaskPriority.HIGH,
    assigneeUserIds: [EDITOR],
  });

  assert.equal(task.orgId, ORG_A);
  assert.equal(task.eventId, EVENT_A);
  assert.equal(task.clientId, null);
  assert.equal(task.title, "Confirm banquet count");
  assert.equal(task.priority, TaskPriority.HIGH);
  assert.equal(task.type, TaskType.EVENT);
  assert.equal(task.source, "MANUAL");
  assert.equal(task.visibility, "INTERNAL");
  assert.equal(task.assignments.length, 1);
  assert.equal(task.activity.some((entry) => entry.type === TaskActivityType.CREATED), true);
  assert.equal(prisma.notifications.length, 1, "selected self-assignment is notified");
  assert.equal(prisma.notifications[0].userId, EDITOR);
  assert.equal(prisma.notifications[0].isRead, false);
  assert.equal(prisma.notifications[0].eventId, EVENT_A);
  assert.deepEqual(accessCalls[0], { eventId: EVENT_A, userId: EDITOR, accessType: "write" });
});

test("list event tasks is scoped to event and org", async () => {
  const { service } = makeService();
  await service.createManualTask(editor, { eventId: EVENT_A, title: "Event A task" });
  await service.createManualTask(editor, { eventId: EVENT_B, title: "Event B task" });

  const tasks = await service.listTasksForEvent(editor, EVENT_A, {});

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].eventId, EVENT_A);
});

test("user cannot see another event/org task", async () => {
  const { service } = makeService();
  const task = await service.createManualTask(editor, { eventId: EVENT_A, title: "Private task" });

  await assert.rejects(() => service.getTask(outsider, task.id), /outside the active organization scope/);
});

test("EVENT_VIEWER can read but cannot mutate tasks", async () => {
  const { service, task } = await seedTask();

  assert.equal((await service.getTask(viewer, task.id)).id, task.id);

  const mutators: Array<() => Promise<unknown>> = [
    () => service.createManualTask(viewer, { eventId: EVENT_A, title: "Nope" }),
    () => service.updateTask(viewer, task.id, { title: "Nope" }),
    () => service.completeTask(viewer, task.id),
    () => service.blockTask(viewer, task.id, "blocked"),
    () => service.reopenTask(viewer, task.id),
    () => service.assignTask(viewer, task.id, EDITOR),
    () => service.addTaskComment(viewer, task.id, { body: "Nope" }),
    () => service.linkTaskToObject(viewer, task.id, TaskLinkObjectType.BUDGET, BUDGET_A),
    () => service.addTaskWatcher(viewer, task.id, VIEWER),
  ];

  for (const mutate of mutators) {
    await assert.rejects(mutate, /Event editor role required/);
  }
});

test("complete task writes status activity and does not mutate linked module records", async () => {
  const { prisma, service, task } = await seedTask();
  await service.linkTaskToObject(editor, task.id, TaskLinkObjectType.BUDGET, BUDGET_A);

  const completed = await service.completeTask(editor, task.id);

  assert.equal(completed.status, TaskStatus.DONE);
  assert.equal(completed.completedByUserId, EDITOR);
  assert.equal(
    completed.activity.some((entry) => entry.type === TaskActivityType.STATUS_CHANGED && entry.message === "Task completed"),
    true,
  );
  assert.equal(prisma.budgets.find((budget) => budget.id === BUDGET_A)?.status, "DRAFT");
  assert.deepEqual(prisma.moduleUpdateCalls, []);
});

test("block task requires reason", async () => {
  const { service, task } = await seedTask();

  await assert.rejects(() => service.blockTask(editor, task.id, " "), /reason is required/);

  const blocked = await service.blockTask(editor, task.id, "Waiting on venue");
  assert.equal(blocked.status, TaskStatus.BLOCKED);
  assert.equal(blocked.activity.some((entry) => entry.message.includes("Waiting on venue")), true);
});

test("reopen task clears completion state", async () => {
  const { service, task } = await seedTask();
  await service.completeTask(editor, task.id);

  const reopened = await service.reopenTask(editor, task.id);

  assert.equal(reopened.status, TaskStatus.OPEN);
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.completedByUserId, null);
});

test("assignment uniqueness makes repeated assignment safe", async () => {
  const { prisma, service, task } = await seedTask();

  await service.assignTask(editor, task.id, EDITOR);
  await service.assignTask(editor, task.id, EDITOR);

  assert.equal(prisma.assignments.filter((assignment) => assignment.taskId === task.id && assignment.userId === EDITOR).length, 1);
  assert.equal(prisma.activity.filter((entry) => entry.taskId === task.id && entry.type === TaskActivityType.ASSIGNED).length, 1);
  assert.equal(prisma.notifications.filter((notification) => notification.userId === EDITOR).length, 1);
});

test("failed task assignment does not create a notification", async () => {
  const { prisma, service, task } = await seedTask();

  await assert.rejects(() => service.assignTask(editor, task.id, OUTSIDER), /event access/);
  assert.equal(prisma.notifications.length, 0);
});

test("watcher uniqueness makes repeated watch safe", async () => {
  const { prisma, service, task } = await seedTask();

  await service.addTaskWatcher(editor, task.id, VIEWER);
  await service.addTaskWatcher(editor, task.id, VIEWER);

  assert.equal(prisma.watchers.filter((watcher) => watcher.taskId === task.id && watcher.userId === VIEWER).length, 1);
  assert.equal(prisma.activity.filter((entry) => entry.taskId === task.id && entry.type === TaskActivityType.WATCHED).length, 1);
});

test("linked object appears in listTasksForObject", async () => {
  const { service, task } = await seedTask();
  await service.linkTaskToObject(editor, task.id, TaskLinkObjectType.BUDGET, BUDGET_A);

  const tasks = await service.listTasksForObject(editor, EVENT_A, TaskLinkObjectType.BUDGET, BUDGET_A);

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, task.id);
  assert.equal(tasks[0].links[0].objectType, TaskLinkObjectType.BUDGET);
});

test("invalid linked object is rejected", async () => {
  const { service, task } = await seedTask();

  await assert.rejects(
    () => service.linkTaskToObject(editor, task.id, TaskLinkObjectType.BUDGET, uuid(999)),
    /Linked object not found/,
  );
});

test("linked object from wrong event is rejected", async () => {
  const { service, task } = await seedTask();

  await assert.rejects(
    () => service.linkTaskToObject(editor, task.id, TaskLinkObjectType.BUDGET, BUDGET_B),
    /outside the task event scope/,
  );
});
