import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  requireRouteUser,
  taskLinkSchema,
  toTaskRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/tasks/_lib/route-helpers";
import { listTasksForObject } from "@/src/server/services/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const query = taskLinkSchema.parse({
      objectType: request.nextUrl.searchParams.get("objectType") ?? undefined,
      objectId: request.nextUrl.searchParams.get("objectId") ?? undefined,
    });
    const tasks = await listTasksForObject(auth.user, eventId, query.objectType, query.objectId);
    return NextResponse.json(tasks);
  } catch (error) {
    return toTaskRouteErrorResponse(error, "GET /api/events/:eventId/tasks/object");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/tasks/object", getHandler);
