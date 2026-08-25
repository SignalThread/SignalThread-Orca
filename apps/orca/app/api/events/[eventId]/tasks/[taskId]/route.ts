import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  assertTaskMatchesRouteEvent,
  parseJsonBody,
  requireRouteUser,
  toTaskRouteErrorResponse,
  updateTaskSchema,
  uuidSchema,
} from "@/app/api/events/[eventId]/tasks/_lib/route-helpers";
import {
  getTask,
  updateTask,
} from "@/src/server/services/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; taskId: string }> },
) {
  const { eventId: rawEventId, taskId: rawTaskId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const taskId = uuidSchema.parse(rawTaskId);
    const task = await getTask(auth.user, taskId);
    assertTaskMatchesRouteEvent(task, eventId);
    return NextResponse.json(task);
  } catch (error) {
    return toTaskRouteErrorResponse(error, "GET /api/events/:eventId/tasks/:taskId");
  }
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; taskId: string }> },
) {
  const { eventId: rawEventId, taskId: rawTaskId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const taskId = uuidSchema.parse(rawTaskId);
    const patch = updateTaskSchema.parse(await parseJsonBody(request));
    assertTaskMatchesRouteEvent(await getTask(auth.user, taskId), eventId);
    const task = await updateTask(auth.user, taskId, patch);
    return NextResponse.json(task);
  } catch (error) {
    return toTaskRouteErrorResponse(error, "PATCH /api/events/:eventId/tasks/:taskId");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/tasks/:taskId", getHandler);
export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/tasks/:taskId", patchHandler);
