import {
  Prisma,
  TaskActivityType,
  TaskLinkObjectType,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  type TaskSource,
  type TaskVisibility,
} from "@prisma/client";
import { assertEventAccessForUser, EventAccessError, type EventAccessType } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { createAssignmentNotifications } from "@/src/server/services/notifications";

export class TaskServiceError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status = 400, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export type TaskServiceUser = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

export type TaskListFilters = {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assigneeUserId?: string;
  type?: TaskType;
  dueBefore?: Date | string;
  dueAfter?: Date | string;
};

export type CreateManualTaskInput = {
  eventId: string;
  title: unknown;
  description?: unknown;
  priority?: unknown;
  dueAt?: unknown;
  assigneeUserIds?: unknown;
  watcherUserIds?: unknown;
  links?: unknown;
  assignmentNotificationLinkUrl?: string;
};

export type UpdateTaskPatch = {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  dueAt?: unknown;
  status?: unknown;
};

export type AddTaskCommentInput = {
  body: unknown;
};

export type TaskLinkInput = {
  objectType: TaskLinkObjectType;
  objectId: string;
};

type EventScope = {
  eventId: string;
  orgId: string;
  clientId: string | null;
};

type LinkTarget = EventScope & {
  objectType: TaskLinkObjectType;
  objectId: string;
  labelSnapshot: string | null;
};

function taskAssignmentHref(
  eventId: string,
  targets: readonly Pick<LinkTarget, "objectType" | "objectId">[],
): string {
  const timelineItem = targets.find((target) => target.objectType === TaskLinkObjectType.TIMELINE_ITEM);
  if (timelineItem) {
    return `/events/${encodeURIComponent(eventId)}/timeline?focus=${encodeURIComponent(timelineItem.objectId)}`;
  }
  return `/events/${encodeURIComponent(eventId)}`;
}

function taskAssignmentNotifications(input: {
  assigneeUserIds: readonly string[];
  scope: EventScope;
  actorUserId: string;
  taskTitle: string;
  targets: readonly Pick<LinkTarget, "objectType" | "objectId">[];
  linkUrl?: string;
}) {
  const linkUrl = input.linkUrl ?? taskAssignmentHref(input.scope.eventId, input.targets);
  return input.assigneeUserIds.map((userId) => ({
    userId,
    orgId: input.scope.orgId,
    eventId: input.scope.eventId,
    actorUserId: input.actorUserId,
    type: "TASK_ASSIGNED",
    title: "Task assigned",
    body: `You were assigned to task “${input.taskTitle}”.`,
    linkUrl,
  }));
}

type AccessCheck = (
  eventId: string,
  user: TaskServiceUser,
  accessType: EventAccessType,
) => Promise<unknown>;

type TaskPrisma = Prisma.TransactionClient & {
  $transaction?<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

type TaskServiceDeps = {
  prisma: TaskPrisma;
  assertEventAccess?: AccessCheck;
  now?: () => Date;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TASK_INCLUDE = {
  assignments: {
    orderBy: { createdAt: "asc" },
  },
  links: {
    orderBy: { createdAt: "asc" },
  },
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  },
  activity: {
    orderBy: { createdAt: "asc" },
  },
  watchers: {
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TaskInclude;

export type TaskRecord = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

function asTaskError(error: unknown, fallbackMessage: string): TaskServiceError {
  if (error instanceof TaskServiceError) return error;
  if (error instanceof EventAccessError) {
    return new TaskServiceError(error.message, error.status, error.reason);
  }
  return new TaskServiceError(fallbackMessage, 500);
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw new TaskServiceError(`${field} must be a valid UUID`, 400);
  }
  return value;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TaskServiceError(`${field} is required`, 400);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "string") {
    throw new TaskServiceError(`${field} must be a string`, 400);
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new TaskServiceError(`${field} must be a valid date`, 400);
  }
  return date;
}

function requireDate(value: unknown, field: string): Date {
  const date = optionalDate(value, field);
  if (!date) {
    throw new TaskServiceError(`${field} must be a valid date`, 400);
  }
  return date;
}

function normalizePriority(value: unknown): TaskPriority {
  if (typeof value === "undefined" || value === null || value === "") return TaskPriority.MEDIUM;
  if (typeof value === "string" && Object.values(TaskPriority).includes(value as TaskPriority)) {
    return value as TaskPriority;
  }
  throw new TaskServiceError("priority is invalid", 400);
}

function normalizeStatus(value: unknown): TaskStatus {
  if (typeof value === "string" && Object.values(TaskStatus).includes(value as TaskStatus)) {
    return value as TaskStatus;
  }
  throw new TaskServiceError("status is invalid", 400);
}

function normalizeStringList(value: unknown, field: string): string[] {
  if (typeof value === "undefined" || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TaskServiceError(`${field} must be an array`, 400);
  }
  return Array.from(new Set(value.map((item) => requireUuid(item, field))));
}

function normalizeObjectType(value: unknown): TaskLinkObjectType {
  if (typeof value === "string" && Object.values(TaskLinkObjectType).includes(value as TaskLinkObjectType)) {
    return value as TaskLinkObjectType;
  }
  throw new TaskServiceError("objectType is invalid", 400);
}

function normalizeLinkInputs(value: unknown): TaskLinkInput[] {
  if (typeof value === "undefined" || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TaskServiceError("links must be an array", 400);
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new TaskServiceError("link must be an object", 400);
    }
    return {
      objectType: normalizeObjectType((entry as { objectType?: unknown }).objectType),
      objectId: requireUuid((entry as { objectId?: unknown }).objectId, "objectId"),
    };
  });
}

function requireSameScope(target: LinkTarget | null, scope: EventScope): LinkTarget {
  if (!target) {
    throw new TaskServiceError("Linked object not found for this event", 404);
  }
  if (target.eventId !== scope.eventId || target.orgId !== scope.orgId) {
    throw new TaskServiceError("Linked object is outside the task event scope", 403);
  }
  if (scope.clientId && target.clientId && target.clientId !== scope.clientId) {
    throw new TaskServiceError("Linked object is outside the task client scope", 403);
  }
  return target;
}

function label(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

async function getEventScope(prisma: Prisma.TransactionClient, eventId: string): Promise<EventScope> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, orgId: true, clientId: true },
  });

  if (!event) {
    throw new TaskServiceError("Event not found", 404);
  }

  return { eventId: event.id, orgId: event.orgId, clientId: event.clientId };
}

async function getTaskScope(
  prisma: Prisma.TransactionClient,
  taskId: string,
): Promise<EventScope & { taskId: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, eventId: true, orgId: true, clientId: true },
  });

  if (!task) {
    throw new TaskServiceError("Task not found", 404);
  }

  return { taskId: task.id, eventId: task.eventId, orgId: task.orgId, clientId: task.clientId };
}

async function loadTask(prisma: Prisma.TransactionClient, taskId: string): Promise<TaskRecord> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: TASK_INCLUDE,
  });

  if (!task) {
    throw new TaskServiceError("Task not found", 404);
  }

  return task;
}

async function assertEventUser(
  prisma: Prisma.TransactionClient,
  scope: EventScope,
  userId: string,
  field: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      orgId: scope.orgId,
      OR: [
        { role: { in: [UserRole.OWNER, UserRole.ADMIN] } },
        { eventMemberships: { some: { eventId: scope.eventId } } },
      ],
    },
    select: { id: true },
  });

  if (!user) {
    throw new TaskServiceError(`${field} must reference a user with event access`, 400);
  }
}

async function addActivity(
  prisma: Prisma.TransactionClient,
  taskId: string,
  actorUserId: string,
  type: TaskActivityType,
  message: string,
): Promise<void> {
  await prisma.taskActivity.create({
    data: { taskId, actorUserId, type, message },
  });
}

async function withTransaction<T>(prisma: TaskPrisma, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (typeof prisma.$transaction === "function") {
    return prisma.$transaction(fn);
  }
  return fn(prisma);
}

async function resolveLinkedObject(
  prisma: Prisma.TransactionClient,
  scope: EventScope,
  objectType: TaskLinkObjectType,
  objectId: string,
): Promise<LinkTarget> {
  const base = { objectType, objectId };

  switch (objectType) {
    case TaskLinkObjectType.EVENT: {
      const row = await prisma.event.findFirst({
        where: { id: objectId },
        select: { id: true, orgId: true, clientId: true, name: true },
      });
      return requireSameScope(
        row && { ...base, eventId: row.id, orgId: row.orgId, clientId: row.clientId, labelSnapshot: label(row.name) },
        scope,
      );
    }
    case TaskLinkObjectType.BUDGET: {
      const row = await prisma.budget.findFirst({
        where: { id: objectId },
        select: { id: true, event: { select: { id: true, orgId: true, clientId: true, name: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.event.name ? `${row.event.name} budget` : "Budget"),
        },
        scope,
      );
    }
    case TaskLinkObjectType.BUDGET_LINE_ITEM: {
      const row = await prisma.budgetLineItem.findFirst({
        where: { id: objectId },
        select: {
          id: true,
          lineItem: true,
          budget: { select: { event: { select: { id: true, orgId: true, clientId: true } } } },
        },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.budget.event.id,
          orgId: row.budget.event.orgId,
          clientId: row.budget.event.clientId,
          labelSnapshot: label(row.lineItem),
        },
        scope,
      );
    }
    case TaskLinkObjectType.BUDGET_SUBMISSION: {
      const row = await prisma.budgetSubmission.findFirst({
        where: { id: objectId },
        select: {
          id: true,
          budget: { select: { event: { select: { id: true, orgId: true, clientId: true } } } },
        },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.budget.event.id,
          orgId: row.budget.event.orgId,
          clientId: row.budget.event.clientId,
          labelSnapshot: "Budget submission",
        },
        scope,
      );
    }
    case TaskLinkObjectType.DOCUMENT: {
      const row = await prisma.document.findFirst({
        where: { id: objectId },
        select: { id: true, eventId: true, orgId: true, title: true, event: { select: { clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.eventId,
          orgId: row.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.title),
        },
        scope,
      );
    }
    case TaskLinkObjectType.DOCUMENT_VERSION: {
      const row = await prisma.documentVersion.findFirst({
        where: { id: objectId },
        select: {
          id: true,
          originalFilename: true,
          document: { select: { eventId: true, orgId: true, event: { select: { clientId: true } } } },
        },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.document.eventId,
          orgId: row.document.orgId,
          clientId: row.document.event.clientId,
          labelSnapshot: label(row.originalFilename),
        },
        scope,
      );
    }
    case TaskLinkObjectType.DEADLINE: {
      const row = await prisma.deadline.findFirst({
        where: { id: objectId },
        select: { id: true, title: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.title),
        },
        scope,
      );
    }
    case TaskLinkObjectType.TIMELINE_ITEM: {
      const row = await prisma.timelineItem.findFirst({
        where: { id: objectId },
        select: { id: true, title: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.title),
        },
        scope,
      );
    }
    case TaskLinkObjectType.MATRIX_ROW: {
      const row = await prisma.matrixRow.findFirst({
        where: { id: objectId },
        select: { id: true, sessionName: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.sessionName),
        },
        scope,
      );
    }
    case TaskLinkObjectType.SESSION_REQUIREMENT_SELECTION: {
      throw new TaskServiceError(
        "SESSION_REQUIREMENT_SELECTION requires a stable UUID before it can be linked directly",
        400,
      );
    }
    case TaskLinkObjectType.SESSION_FNB_CATALOG_ASSIGNMENT: {
      const row = await prisma.sessionFnbCatalogAssignment.findFirst({
        where: { id: objectId },
        select: { id: true, session: { select: { event: { select: { id: true, orgId: true, clientId: true } } } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.session.event.id,
          orgId: row.session.event.orgId,
          clientId: row.session.event.clientId,
          labelSnapshot: "F&B catalog assignment",
        },
        scope,
      );
    }
    case TaskLinkObjectType.SEATING_PLAN: {
      const row = await prisma.seatingPlan.findFirst({
        where: { id: objectId },
        select: { id: true, name: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.name),
        },
        scope,
      );
    }
    case TaskLinkObjectType.SEATING_TABLE: {
      const row = await prisma.seatingTable.findFirst({
        where: { id: objectId },
        select: { id: true, name: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.name),
        },
        scope,
      );
    }
    case TaskLinkObjectType.SEATING_ASSIGNMENT: {
      const row = await prisma.seatingAssignment.findFirst({
        where: { id: objectId },
        select: { id: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: "Seating assignment",
        },
        scope,
      );
    }
    case TaskLinkObjectType.SPEAKER: {
      const row = await prisma.speaker.findFirst({
        where: { id: objectId },
        select: { id: true, name: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.name),
        },
        scope,
      );
    }
    case TaskLinkObjectType.SPEAKER_PROFILE_SUBMISSION: {
      const row = await prisma.speakerProfileSubmission.findFirst({
        where: { id: objectId },
        select: { id: true, speaker: { select: { name: true } }, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.speaker.name ? `${row.speaker.name} profile submission` : "Speaker profile submission"),
        },
        scope,
      );
    }
    case TaskLinkObjectType.SPEAKER_DOCUMENT_REQUEST: {
      const row = await prisma.speakerDocumentRequest.findFirst({
        where: { id: objectId },
        select: { id: true, title: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.title),
        },
        scope,
      );
    }
    case TaskLinkObjectType.SPEAKER_FILE: {
      const row = await prisma.speakerFile.findFirst({
        where: { id: objectId },
        select: { id: true, filename: true, event: { select: { id: true, orgId: true, clientId: true } } },
      });
      return requireSameScope(
        row && {
          ...base,
          eventId: row.event.id,
          orgId: row.event.orgId,
          clientId: row.event.clientId,
          labelSnapshot: label(row.filename),
        },
        scope,
      );
    }
  }
}

export function createTaskService(deps: TaskServiceDeps) {
  const prisma = deps.prisma;
  const checkAccess = deps.assertEventAccess ?? assertEventAccessForUser;
  const now = deps.now ?? (() => new Date());

  async function assertAccess(eventId: string, user: TaskServiceUser, accessType: EventAccessType): Promise<void> {
    await checkAccess(eventId, user, accessType);
  }

  async function readTaskScope(user: TaskServiceUser, taskId: string, accessType: EventAccessType): Promise<EventScope & { taskId: string }> {
    const id = requireUuid(taskId, "taskId");
    const scope = await getTaskScope(prisma, id);
    await assertAccess(scope.eventId, user, accessType);
    return scope;
  }

  return {
    async listTasksForEvent(user: TaskServiceUser, eventIdInput: string, filters: TaskListFilters = {}): Promise<TaskRecord[]> {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "read");
        const scope = await getEventScope(prisma, eventId);

        const where: Prisma.TaskWhereInput = {
          orgId: scope.orgId,
          eventId: scope.eventId,
          source: "MANUAL" satisfies TaskSource,
          visibility: "INTERNAL" satisfies TaskVisibility,
        };

        if (filters.status) where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
        if (filters.priority) where.priority = Array.isArray(filters.priority) ? { in: filters.priority } : filters.priority;
        if (filters.type) where.type = filters.type;
        if (filters.assigneeUserId) {
          where.assignments = { some: { userId: requireUuid(filters.assigneeUserId, "assigneeUserId") } };
        }
        if (filters.dueBefore || filters.dueAfter) {
          where.dueAt = {
            ...(filters.dueAfter ? { gte: requireDate(filters.dueAfter, "dueAfter") } : {}),
            ...(filters.dueBefore ? { lte: requireDate(filters.dueBefore, "dueBefore") } : {}),
          };
        }

        return await prisma.task.findMany({
          where,
          include: TASK_INCLUDE,
          orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        });
      } catch (error) {
        throw asTaskError(error, "Failed to list tasks");
      }
    },

    async getTask(user: TaskServiceUser, taskId: string): Promise<TaskRecord> {
      try {
        const scope = await readTaskScope(user, taskId, "read");
        const task = await loadTask(prisma, scope.taskId);
        if (task.source !== "MANUAL" || task.visibility !== "INTERNAL") {
          throw new TaskServiceError("Task not found", 404);
        }
        return task;
      } catch (error) {
        throw asTaskError(error, "Failed to get task");
      }
    },

    async createManualTask(user: TaskServiceUser, input: CreateManualTaskInput): Promise<TaskRecord> {
      try {
        const eventId = requireUuid(input.eventId, "eventId");
        await assertAccess(eventId, user, "write");
        const scope = await getEventScope(prisma, eventId);
        const title = requireText(input.title, "title");
        const description = optionalText(input.description, "description");
        const priority = normalizePriority(input.priority);
        const dueAt = optionalDate(input.dueAt, "dueAt");
        const assigneeUserIds = normalizeStringList(input.assigneeUserIds, "assigneeUserIds");
        const watcherUserIds = normalizeStringList(input.watcherUserIds, "watcherUserIds");
        const links = normalizeLinkInputs(input.links);

        for (const assigneeUserId of assigneeUserIds) {
          await assertEventUser(prisma, scope, assigneeUserId, "assigneeUserId");
        }
        for (const watcherUserId of watcherUserIds) {
          await assertEventUser(prisma, scope, watcherUserId, "watcherUserId");
        }
        const targets: LinkTarget[] = [];
        for (const link of links) {
          targets.push(await resolveLinkedObject(prisma, scope, link.objectType, link.objectId));
        }

        return await withTransaction(prisma, async (tx) => {
          const task = await tx.task.create({
            data: {
              orgId: scope.orgId,
              eventId: scope.eventId,
              clientId: scope.clientId,
              title,
              description,
              priority,
              dueAt,
              type: targets.length > 0 ? TaskType.OBJECT_LINKED : TaskType.EVENT,
              source: "MANUAL",
              visibility: "INTERNAL",
              createdByUserId: user.id,
            },
            select: { id: true },
          });

          for (const assigneeUserId of assigneeUserIds) {
            await tx.taskAssignment.create({
              data: { taskId: task.id, userId: assigneeUserId, assignedByUserId: user.id },
            });
          }
          for (const watcherUserId of watcherUserIds) {
            await tx.taskWatcher.create({
              data: { taskId: task.id, userId: watcherUserId },
            });
          }
          for (const target of targets) {
            await tx.taskLink.create({
              data: {
                taskId: task.id,
                objectType: target.objectType,
                objectId: target.objectId,
                labelSnapshot: target.labelSnapshot,
              },
            });
          }
          await addActivity(tx, task.id, user.id, TaskActivityType.CREATED, "Task created");
          if (assigneeUserIds.length > 0) {
            await createAssignmentNotifications(taskAssignmentNotifications({
              assigneeUserIds,
              scope,
              actorUserId: user.id,
              taskTitle: title,
              targets,
              linkUrl: input.assignmentNotificationLinkUrl,
            }), tx);
          }
          return loadTask(tx, task.id);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to create task");
      }
    },

    async updateTask(user: TaskServiceUser, taskId: string, patch: UpdateTaskPatch): Promise<TaskRecord> {
      try {
        const scope = await readTaskScope(user, taskId, "write");
        const data: Prisma.TaskUpdateInput = {};

        if (typeof patch.title !== "undefined") data.title = requireText(patch.title, "title");
        if (typeof patch.description !== "undefined") data.description = optionalText(patch.description, "description");
        if (typeof patch.priority !== "undefined") data.priority = normalizePriority(patch.priority);
        if (typeof patch.dueAt !== "undefined") data.dueAt = optionalDate(patch.dueAt, "dueAt");
        if (typeof patch.status !== "undefined") data.status = normalizeStatus(patch.status);

        if (Object.keys(data).length === 0) {
          throw new TaskServiceError("At least one task field is required", 400);
        }
        const changesStatus = typeof patch.status !== "undefined";

        return await withTransaction(prisma, async (tx) => {
          await tx.task.update({ where: { id: scope.taskId }, data });
          await addActivity(
            tx,
            scope.taskId,
            user.id,
            changesStatus ? TaskActivityType.STATUS_CHANGED : TaskActivityType.UPDATED,
            changesStatus ? "Task status changed" : "Task updated",
          );
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to update task");
      }
    },

    async completeTask(user: TaskServiceUser, taskId: string): Promise<TaskRecord> {
      try {
        const scope = await readTaskScope(user, taskId, "write");
        const current = await prisma.task.findUnique({
          where: { id: scope.taskId },
          select: { status: true },
        });
        if (!current) throw new TaskServiceError("Task not found", 404);
        if (current.status === TaskStatus.DONE) return loadTask(prisma, scope.taskId);

        return await withTransaction(prisma, async (tx) => {
          await tx.task.update({
            where: { id: scope.taskId },
            data: {
              status: TaskStatus.DONE,
              completedAt: now(),
              completedByUserId: user.id,
              canceledAt: null,
              canceledByUserId: null,
            },
          });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.STATUS_CHANGED, "Task completed");
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to complete task");
      }
    },

    async blockTask(user: TaskServiceUser, taskId: string, reason: unknown): Promise<TaskRecord> {
      try {
        const blockReason = requireText(reason, "reason");
        const scope = await readTaskScope(user, taskId, "write");
        return await withTransaction(prisma, async (tx) => {
          await tx.task.update({ where: { id: scope.taskId }, data: { status: TaskStatus.BLOCKED } });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.STATUS_CHANGED, `Task blocked: ${blockReason}`);
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to block task");
      }
    },

    async reopenTask(user: TaskServiceUser, taskId: string): Promise<TaskRecord> {
      try {
        const scope = await readTaskScope(user, taskId, "write");
        const current = await prisma.task.findUnique({
          where: { id: scope.taskId },
          select: { status: true },
        });
        if (!current) throw new TaskServiceError("Task not found", 404);
        if (current.status === TaskStatus.OPEN) return loadTask(prisma, scope.taskId);

        return await withTransaction(prisma, async (tx) => {
          await tx.task.update({
            where: { id: scope.taskId },
            data: {
              status: TaskStatus.OPEN,
              completedAt: null,
              completedByUserId: null,
              canceledAt: null,
              canceledByUserId: null,
            },
          });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.STATUS_CHANGED, "Task reopened");
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to reopen task");
      }
    },

    async assignTask(user: TaskServiceUser, taskId: string, assigneeUserIdInput: string): Promise<TaskRecord> {
      try {
        const assigneeUserId = requireUuid(assigneeUserIdInput, "assigneeUserId");
        const scope = await readTaskScope(user, taskId, "write");
        await assertEventUser(prisma, scope, assigneeUserId, "assigneeUserId");
        const existing = await prisma.taskAssignment.findUnique({
          where: { taskId_userId: { taskId: scope.taskId, userId: assigneeUserId } },
          select: { taskId: true },
        });
        if (existing) return loadTask(prisma, scope.taskId);

        return await withTransaction(prisma, async (tx) => {
          await tx.taskAssignment.create({
            data: { taskId: scope.taskId, userId: assigneeUserId, assignedByUserId: user.id },
          });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.ASSIGNED, "Task assigned");
          const task = await loadTask(tx, scope.taskId);
          await createAssignmentNotifications(taskAssignmentNotifications({
            assigneeUserIds: [assigneeUserId],
            scope,
            actorUserId: user.id,
            taskTitle: task.title,
            targets: task.links,
          }), tx);
          return task;
        });
      } catch (error) {
        throw asTaskError(error, "Failed to assign task");
      }
    },

    async addTaskComment(user: TaskServiceUser, taskId: string, input: AddTaskCommentInput): Promise<TaskRecord> {
      try {
        const body = requireText(input.body, "body");
        const scope = await readTaskScope(user, taskId, "write");
        return await withTransaction(prisma, async (tx) => {
          await tx.taskComment.create({
            data: { taskId: scope.taskId, authorUserId: user.id, body },
          });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.COMMENTED, "Comment added");
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to add comment");
      }
    },

    async listTasksForObject(
      user: TaskServiceUser,
      eventIdInput: string,
      objectTypeInput: TaskLinkObjectType,
      objectIdInput: string,
    ): Promise<TaskRecord[]> {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        const objectType = normalizeObjectType(objectTypeInput);
        const objectId = requireUuid(objectIdInput, "objectId");
        await assertAccess(eventId, user, "read");
        const scope = await getEventScope(prisma, eventId);
        await resolveLinkedObject(prisma, scope, objectType, objectId);

        return await prisma.task.findMany({
          where: {
            orgId: scope.orgId,
            eventId: scope.eventId,
            source: "MANUAL",
            visibility: "INTERNAL",
            links: { some: { objectType, objectId } },
          },
          include: TASK_INCLUDE,
          orderBy: [{ updatedAt: "desc" }],
        });
      } catch (error) {
        throw asTaskError(error, "Failed to list object tasks");
      }
    },

    async linkTaskToObject(
      user: TaskServiceUser,
      taskId: string,
      objectTypeInput: TaskLinkObjectType,
      objectIdInput: string,
    ): Promise<TaskRecord> {
      try {
        const objectType = normalizeObjectType(objectTypeInput);
        const objectId = requireUuid(objectIdInput, "objectId");
        const scope = await readTaskScope(user, taskId, "write");
        const target = await resolveLinkedObject(prisma, scope, objectType, objectId);
        const existing = await prisma.taskLink.findFirst({
          where: { taskId: scope.taskId, objectType, objectId },
          select: { id: true },
        });
        if (existing) return loadTask(prisma, scope.taskId);

        return await withTransaction(prisma, async (tx) => {
          await tx.taskLink.create({
            data: {
              taskId: scope.taskId,
              objectType,
              objectId,
              labelSnapshot: target.labelSnapshot,
            },
          });
          await tx.task.update({ where: { id: scope.taskId }, data: { type: TaskType.OBJECT_LINKED } });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.LINKED, "Task linked to object");
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to link task");
      }
    },

    async addTaskWatcher(user: TaskServiceUser, taskId: string, watcherUserIdInput: string): Promise<TaskRecord> {
      try {
        const watcherUserId = requireUuid(watcherUserIdInput, "watcherUserId");
        const scope = await readTaskScope(user, taskId, "write");
        await assertEventUser(prisma, scope, watcherUserId, "watcherUserId");
        const existing = await prisma.taskWatcher.findUnique({
          where: { taskId_userId: { taskId: scope.taskId, userId: watcherUserId } },
          select: { taskId: true },
        });
        if (existing) return loadTask(prisma, scope.taskId);

        return await withTransaction(prisma, async (tx) => {
          await tx.taskWatcher.create({ data: { taskId: scope.taskId, userId: watcherUserId } });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.WATCHED, "Task watcher added");
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to add watcher");
      }
    },

    async removeTaskWatcher(user: TaskServiceUser, taskId: string, watcherUserIdInput: string): Promise<TaskRecord> {
      try {
        const watcherUserId = requireUuid(watcherUserIdInput, "watcherUserId");
        const scope = await readTaskScope(user, taskId, "write");
        const existing = await prisma.taskWatcher.findUnique({
          where: { taskId_userId: { taskId: scope.taskId, userId: watcherUserId } },
          select: { taskId: true },
        });
        if (!existing) return loadTask(prisma, scope.taskId);

        return await withTransaction(prisma, async (tx) => {
          await tx.taskWatcher.delete({
            where: { taskId_userId: { taskId: scope.taskId, userId: watcherUserId } },
          });
          await addActivity(tx, scope.taskId, user.id, TaskActivityType.UNWATCHED, "Task watcher removed");
          return loadTask(tx, scope.taskId);
        });
      } catch (error) {
        throw asTaskError(error, "Failed to remove watcher");
      }
    },
  };
}

function defaultService() {
  return createTaskService({ prisma: getPrisma() });
}

export async function listTasksForEvent(
  user: TaskServiceUser,
  eventId: string,
  filters: TaskListFilters = {},
): Promise<TaskRecord[]> {
  return defaultService().listTasksForEvent(user, eventId, filters);
}

export async function getTask(user: TaskServiceUser, taskId: string): Promise<TaskRecord> {
  return defaultService().getTask(user, taskId);
}

export async function createManualTask(user: TaskServiceUser, input: CreateManualTaskInput): Promise<TaskRecord> {
  return defaultService().createManualTask(user, input);
}

export async function updateTask(user: TaskServiceUser, taskId: string, patch: UpdateTaskPatch): Promise<TaskRecord> {
  return defaultService().updateTask(user, taskId, patch);
}

export async function completeTask(user: TaskServiceUser, taskId: string): Promise<TaskRecord> {
  return defaultService().completeTask(user, taskId);
}

export async function blockTask(user: TaskServiceUser, taskId: string, reason: unknown): Promise<TaskRecord> {
  return defaultService().blockTask(user, taskId, reason);
}

export async function reopenTask(user: TaskServiceUser, taskId: string): Promise<TaskRecord> {
  return defaultService().reopenTask(user, taskId);
}

export async function assignTask(
  user: TaskServiceUser,
  taskId: string,
  assigneeUserId: string,
): Promise<TaskRecord> {
  return defaultService().assignTask(user, taskId, assigneeUserId);
}

export async function addTaskComment(
  user: TaskServiceUser,
  taskId: string,
  input: AddTaskCommentInput,
): Promise<TaskRecord> {
  return defaultService().addTaskComment(user, taskId, input);
}

export async function listTasksForObject(
  user: TaskServiceUser,
  eventId: string,
  objectType: TaskLinkObjectType,
  objectId: string,
): Promise<TaskRecord[]> {
  return defaultService().listTasksForObject(user, eventId, objectType, objectId);
}

export async function linkTaskToObject(
  user: TaskServiceUser,
  taskId: string,
  objectType: TaskLinkObjectType,
  objectId: string,
): Promise<TaskRecord> {
  return defaultService().linkTaskToObject(user, taskId, objectType, objectId);
}

export async function addTaskWatcher(
  user: TaskServiceUser,
  taskId: string,
  watcherUserId: string,
): Promise<TaskRecord> {
  return defaultService().addTaskWatcher(user, taskId, watcherUserId);
}

export async function removeTaskWatcher(
  user: TaskServiceUser,
  taskId: string,
  watcherUserId: string,
): Promise<TaskRecord> {
  return defaultService().removeTaskWatcher(user, taskId, watcherUserId);
}
