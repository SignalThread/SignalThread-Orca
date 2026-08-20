"use client";

/** Stable internal transport contract. No provider or synchronization semantics are implied. */
export const TASK_API_CONTRACT_VERSION = "2026-08-06" as const;
export const TASK_API_CAPABILITIES = [
  "LIST",
  "CREATE_MANUAL",
  "UPDATE",
  "COMPLETE",
  "REOPEN",
  "BLOCK",
  "ASSIGN",
  "COMMENT",
  "LINK",
  "WATCH",
] as const;

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TaskType = "EVENT" | "OBJECT_LINKED";
export type TaskLinkObjectType =
  | "EVENT"
  | "BUDGET"
  | "BUDGET_LINE_ITEM"
  | "BUDGET_SUBMISSION"
  | "DOCUMENT"
  | "DOCUMENT_VERSION"
  | "DEADLINE"
  | "TIMELINE_ITEM"
  | "MATRIX_ROW"
  | "SESSION_REQUIREMENT_SELECTION"
  | "SESSION_FNB_CATALOG_ASSIGNMENT"
  | "SEATING_PLAN"
  | "SEATING_TABLE"
  | "SEATING_ASSIGNMENT"
  | "SPEAKER"
  | "SPEAKER_PROFILE_SUBMISSION"
  | "SPEAKER_DOCUMENT_REQUEST"
  | "SPEAKER_FILE";

export type TaskAssignment = {
  taskId: string;
  userId: string;
  role: "OWNER" | "CONTRIBUTOR";
  assignedByUserId: string | null;
  createdAt: string;
};

export type TaskLink = {
  id: string;
  taskId: string;
  objectType: TaskLinkObjectType;
  objectId: string;
  labelSnapshot: string | null;
  createdAt: string;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type TaskActivity = {
  id: string;
  taskId: string;
  actorUserId: string | null;
  type:
    | "CREATED"
    | "UPDATED"
    | "STATUS_CHANGED"
    | "ASSIGNED"
    | "UNASSIGNED"
    | "COMMENTED"
    | "LINKED"
    | "UNLINKED"
    | "WATCHED"
    | "UNWATCHED";
  message: string;
  createdAt: string;
};

export type TaskWatcher = {
  taskId: string;
  userId: string;
  createdAt: string;
};

export type TaskAssignableUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export type TaskRecord = {
  id: string;
  orgId: string;
  eventId: string;
  clientId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  source: "MANUAL";
  visibility: "INTERNAL";
  dueAt: string | null;
  createdByUserId: string;
  completedAt: string | null;
  completedByUserId: string | null;
  canceledAt: string | null;
  canceledByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: TaskAssignment[];
  links: TaskLink[];
  comments: TaskComment[];
  activity: TaskActivity[];
  watchers: TaskWatcher[];
};

export type TaskStatusSummary = {
  total: number;
  blocked: number;
  open: number;
  done: number;
};

export class TaskApiError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export function summarizeTasks(tasks: TaskRecord[]): TaskStatusSummary {
  return tasks.reduce<TaskStatusSummary>(
    (summary, task) => {
      summary.total += 1;
      if (task.status === "BLOCKED") summary.blocked += 1;
      if (task.status === "OPEN" || task.status === "IN_PROGRESS") summary.open += 1;
      if (task.status === "DONE") summary.done += 1;
      return summary;
    },
    { total: 0, blocked: 0, open: 0, done: 0 },
  );
}

export function isReadOnlyTaskApiError(error: unknown): boolean {
  return error instanceof TaskApiError && (error.status === 401 || error.status === 403);
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : fallbackMessage;
    throw new TaskApiError(message, response.status, typeof payload?.reason === "string" ? payload.reason : undefined);
  }
  return payload as T;
}

function eventTaskBase(eventId: string): string {
  return `/api/events/${encodeURIComponent(eventId)}/tasks`;
}

function taskBase(eventId: string, taskId: string): string {
  return `${eventTaskBase(eventId)}/${encodeURIComponent(taskId)}`;
}

export async function listObjectTasks(
  eventId: string,
  objectType: TaskLinkObjectType,
  objectId: string,
  signal?: AbortSignal,
): Promise<TaskRecord[]> {
  const params = new URLSearchParams({ objectType, objectId });
  const response = await fetch(`${eventTaskBase(eventId)}/object?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  return parseApiResponse<TaskRecord[]>(response, "Failed to load tasks");
}

export async function listTaskAssignees(eventId: string, signal?: AbortSignal): Promise<TaskAssignableUser[]> {
  const response = await fetch(`${eventTaskBase(eventId)}/assignees`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  return parseApiResponse<TaskAssignableUser[]>(response, "Failed to load assignable users");
}

export async function createManualTask(input: {
  eventId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  assigneeUserIds?: string[];
  watcherUserIds?: string[];
  links?: Array<{ objectType: TaskLinkObjectType; objectId: string }>;
}): Promise<TaskRecord> {
  const response = await fetch(eventTaskBase(input.eventId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "MEDIUM",
      dueAt: input.dueAt ?? null,
      assigneeUserIds: input.assigneeUserIds ?? [],
      watcherUserIds: input.watcherUserIds ?? [],
      links: input.links ?? [],
    }),
  });
  return parseApiResponse<TaskRecord>(response, "Failed to create task");
}

export async function createLinkedManualTask(input: {
  eventId: string;
  objectType: TaskLinkObjectType;
  objectId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  assigneeUserIds?: string[];
  watcherUserIds?: string[];
}): Promise<TaskRecord> {
  return createManualTask({
    eventId: input.eventId,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    dueAt: input.dueAt ?? null,
    assigneeUserIds: input.assigneeUserIds,
    watcherUserIds: input.watcherUserIds,
    links: [{ objectType: input.objectType, objectId: input.objectId }],
  });
}

export async function updateTask(
  eventId: string,
  taskId: string,
  patch: Partial<Pick<TaskRecord, "title" | "description" | "priority" | "dueAt" | "status">>,
): Promise<TaskRecord> {
  const response = await fetch(taskBase(eventId, taskId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  return parseApiResponse<TaskRecord>(response, "Failed to update task");
}

export async function completeTask(eventId: string, taskId: string): Promise<TaskRecord> {
  const response = await fetch(`${taskBase(eventId, taskId)}/complete`, {
    method: "POST",
    credentials: "include",
  });
  return parseApiResponse<TaskRecord>(response, "Failed to complete task");
}

export async function blockTask(eventId: string, taskId: string, reason: string): Promise<TaskRecord> {
  const response = await fetch(`${taskBase(eventId, taskId)}/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason }),
  });
  return parseApiResponse<TaskRecord>(response, "Failed to block task");
}

export async function reopenTask(eventId: string, taskId: string): Promise<TaskRecord> {
  const response = await fetch(`${taskBase(eventId, taskId)}/reopen`, {
    method: "POST",
    credentials: "include",
  });
  return parseApiResponse<TaskRecord>(response, "Failed to reopen task");
}

export async function assignTask(eventId: string, taskId: string, assigneeUserId: string): Promise<TaskRecord> {
  const response = await fetch(`${taskBase(eventId, taskId)}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ assigneeUserId }),
  });
  return parseApiResponse<TaskRecord>(response, "Failed to assign task");
}

export async function addTaskComment(eventId: string, taskId: string, body: string): Promise<TaskRecord> {
  const response = await fetch(`${taskBase(eventId, taskId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ body }),
  });
  return parseApiResponse<TaskRecord>(response, "Failed to add comment");
}

export async function addTaskWatcher(eventId: string, taskId: string, watcherUserId: string): Promise<TaskRecord> {
  const response = await fetch(`${taskBase(eventId, taskId)}/watchers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ watcherUserId }),
  });
  return parseApiResponse<TaskRecord>(response, "Failed to add watcher");
}

export async function removeTaskWatcher(eventId: string, taskId: string, watcherUserId: string): Promise<TaskRecord> {
  const response = await fetch(`${taskBase(eventId, taskId)}/watchers/${encodeURIComponent(watcherUserId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseApiResponse<TaskRecord>(response, "Failed to remove watcher");
}
