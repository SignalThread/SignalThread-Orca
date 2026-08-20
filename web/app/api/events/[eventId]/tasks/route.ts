import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createTaskSchema,
  listTasksQuerySchema,
  parseJsonBody,
  requireRouteUser,
  toTaskRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/tasks/_lib/route-helpers";
import {
  createManualTask,
  listTasksForEvent,
} from "@/src/server/services/tasks";

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
    const filters = listTasksQuerySchema.parse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      priority: request.nextUrl.searchParams.get("priority") ?? undefined,
      assigneeUserId: request.nextUrl.searchParams.get("assigneeUserId") ?? undefined,
      type: request.nextUrl.searchParams.get("type") ?? undefined,
      dueBefore: request.nextUrl.searchParams.get("dueBefore") ?? undefined,
      dueAfter: request.nextUrl.searchParams.get("dueAfter") ?? undefined,
    });
    const tasks = await listTasksForEvent(auth.user, eventId, filters);
    return NextResponse.json(tasks);
  } catch (error) {
    return toTaskRouteErrorResponse(error, "GET /api/events/:eventId/tasks");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId: rawEventId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const eventId = uuidSchema.parse(rawEventId);
    const body = createTaskSchema.parse(await parseJsonBody(request));
    const task = await createManualTask(auth.user, { ...body, eventId });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return toTaskRouteErrorResponse(error, "POST /api/events/:eventId/tasks");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/tasks", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/tasks", postHandler);
