import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveRequestUser } from "@/lib/request-user";
import {
  bulkDeleteTimelineItemSchema,
  bulkUpdateTimelineItemSchema,
} from "@/lib/timeline/types";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  bulkDeleteTimelineItems,
  bulkUpdateTimelineItems,
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

async function parseJsonBody(request: NextRequest): Promise<unknown> {
  const rawBody = await request.text();
  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

async function patchHandler(
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
    body = await parseJsonBody(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const parsedBody = bulkUpdateTimelineItemSchema.parse(body);
    const result = await bulkUpdateTimelineItems(eventId, authResult.user, parsedBody);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/timeline-items/bulk");
  }
}

async function deleteHandler(
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
    body = await parseJsonBody(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const parsedBody = bulkDeleteTimelineItemSchema.parse(body);
    const result = await bulkDeleteTimelineItems(eventId, authResult.user, parsedBody);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/timeline-items/bulk");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/timeline-items/bulk", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/timeline-items/bulk", deleteHandler);
