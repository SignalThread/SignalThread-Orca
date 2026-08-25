import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  assertTaskMatchesRouteEvent,
  commentTaskSchema,
  parseJsonBody,
  requireRouteUser,
  toTaskRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/tasks/_lib/route-helpers";
import { addTaskComment, getTask } from "@/src/server/services/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; taskId: string }> },
) {
  const { eventId: rawEventId, taskId: rawTaskId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const taskId = uuidSchema.parse(rawTaskId);
    const body = commentTaskSchema.parse(await parseJsonBody(request));
    assertTaskMatchesRouteEvent(await getTask(auth.user, taskId), eventId);
    const task = await addTaskComment(auth.user, taskId, body);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return toTaskRouteErrorResponse(error, "POST /api/events/:eventId/tasks/:taskId/comments");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/tasks/:taskId/comments", postHandler);
