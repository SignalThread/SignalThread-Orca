import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  assertTaskMatchesRouteEvent,
  requireRouteUser,
  toTaskRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/tasks/_lib/route-helpers";
import { getTask, removeTaskWatcher } from "@/src/server/services/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; taskId: string; userId: string }> },
) {
  const { eventId: rawEventId, taskId: rawTaskId, userId: rawUserId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const taskId = uuidSchema.parse(rawTaskId);
    const userId = uuidSchema.parse(rawUserId);
    assertTaskMatchesRouteEvent(await getTask(auth.user, taskId), eventId);
    const task = await removeTaskWatcher(auth.user, taskId, userId);
    return NextResponse.json(task);
  } catch (error) {
    return toTaskRouteErrorResponse(error, "DELETE /api/events/:eventId/tasks/:taskId/watchers/:userId");
  }
}

export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/tasks/:taskId/watchers/:userId", deleteHandler);
