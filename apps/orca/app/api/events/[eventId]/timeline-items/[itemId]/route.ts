import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveRequestUser } from "@/lib/request-user";
import { updateTimelineItemSchema } from "@/lib/timeline/types";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { serializeTimelineItemDates } from "@/lib/timeline/date-normalization";
import {
  deleteTimelineItem,
  TimelineServiceError,
  updateTimelineItem,
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

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; itemId: string }> },
) {
  const { eventId, itemId } = await params;
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
    const parsedBody = updateTimelineItemSchema.parse(body);
    const item = await updateTimelineItem(eventId, itemId, authResult.user, parsedBody);
    return NextResponse.json(serializeTimelineItemDates(item));
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/timeline-items/:itemId");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; itemId: string }> },
) {
  const { eventId, itemId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(
      authResult.error.status,
      authResult.error.reason,
      authResult.error.hint,
    );
  }

  try {
    await deleteTimelineItem(eventId, itemId, authResult.user);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/timeline-items/:itemId");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/timeline-items/:itemId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/timeline-items/:itemId", deleteHandler);
