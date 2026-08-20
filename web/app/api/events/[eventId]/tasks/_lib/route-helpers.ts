import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  TaskLinkObjectType,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@prisma/client";
import { resolveRequestUser, type RequestUserResult } from "@/lib/request-user";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { TaskServiceError } from "@/src/server/services/tasks";

type RouteUser = Extract<RequestUserResult, { user: unknown }>["user"];

export const uuidSchema = z.string().uuid();

export const listTasksQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assigneeUserId: uuidSchema.optional(),
  type: z.nativeEnum(TaskType).optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeUserIds: z.array(uuidSchema).optional(),
  watcherUserIds: z.array(uuidSchema).optional(),
  links: z
    .array(
      z.object({
        objectType: z.nativeEnum(TaskLinkObjectType),
        objectId: uuidSchema,
      }),
    )
    .optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
});

export const blockTaskSchema = z.object({
  reason: z.string().trim().min(1),
});

export const assignTaskSchema = z.object({
  assigneeUserId: uuidSchema,
});

export const commentTaskSchema = z.object({
  body: z.string().trim().min(1),
});

export const taskLinkSchema = z.object({
  objectType: z.nativeEnum(TaskLinkObjectType),
  objectId: uuidSchema,
});

export const watcherTaskSchema = z.object({
  watcherUserId: uuidSchema,
});

export function assertTaskMatchesRouteEvent(task: { eventId: string }, eventId: string): void {
  if (task.eventId !== eventId) {
    throw new TaskServiceError("Task not found", 404);
  }
}

export async function requireRouteUser(request: NextRequest): Promise<{ user: RouteUser } | { response: NextResponse }> {
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return {
      response: NextResponse.json(
        {
          message: authResult.error.status === 403 ? "Forbidden" : "Unauthorized",
          reason: authResult.error.reason,
          hint: authResult.error.hint,
        },
        { status: authResult.error.status },
      ),
    };
  }

  return { user: authResult.user };
}

export async function parseJsonBody(request: NextRequest): Promise<unknown> {
  try {
    const rawBody = await request.text();
    return rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    throw new TaskServiceError("Invalid JSON body", 400);
  }
}

export function toTaskRouteErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
  }

  if (error instanceof TaskServiceError) {
    return NextResponse.json(
      { error: error.message, ...(error.reason ? { reason: error.reason } : {}) },
      { status: error.status },
    );
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
