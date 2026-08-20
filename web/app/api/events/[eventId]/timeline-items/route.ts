import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { serializeTimelineItemDates } from "@/lib/timeline/date-normalization";
import {
  createTimelineItemSchema,
  listTimelineItemsQuerySchema,
} from "@/lib/timeline/types";
import {
  createTimelineItem,
  listTimelineItems,
  TimelineServiceError,
} from "@/src/server/services/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    {
      message: status === 403 ? "Forbidden" : "Unauthorized",
      reason,
      hint,
    },
    { status },
  );
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: error.issues },
      { status: 400 },
    );
  }

  if (error instanceof TimelineServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(
      authResult.error.status,
      authResult.error.reason,
      authResult.error.hint,
    );
  }

  try {
    const parsedQuery = listTimelineItemsQuerySchema.parse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      department: request.nextUrl.searchParams.get("department") ?? undefined,
      ownerUserId: request.nextUrl.searchParams.get("ownerUserId") ?? undefined,
      priority: request.nextUrl.searchParams.get("priority") ?? undefined,
      disposition: request.nextUrl.searchParams.get("disposition") ?? undefined,
      orderBy: request.nextUrl.searchParams.get("orderBy") ?? undefined,
    });

    const items = await listTimelineItems(eventId, authResult.user, parsedQuery);
    return NextResponse.json(items.map(serializeTimelineItemDates));
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/timeline-items");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(
      authResult.error.status,
      authResult.error.reason,
      authResult.error.hint,
    );
  }

  let body: unknown = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const parsedBody = createTimelineItemSchema.parse(body);
    const item = await createTimelineItem(eventId, authResult.user, parsedBody);
    return NextResponse.json(serializeTimelineItemDates(item), { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/timeline-items");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/timeline-items", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/timeline-items", postHandler);
