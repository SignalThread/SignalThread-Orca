import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  assertTaskMatchesRouteEvent,
  blockTaskSchema,
  parseJsonBody,
  requireRouteUser,
  toTaskRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/tasks/_lib/route-helpers";
import { blockTask, getTask } from "@/src/server/services/tasks";

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
    const body = blockTaskSchema.parse(await parseJsonBody(request));
    assertTaskMatchesRouteEvent(await getTask(auth.user, taskId), eventId);
    const task = await blockTask(auth.user, taskId, body.reason);
    return NextResponse.json(task);
  } catch (error) {
    return toTaskRouteErrorResponse(error, "POST /api/events/:eventId/tasks/:taskId/block");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/tasks/:taskId/block", postHandler);
