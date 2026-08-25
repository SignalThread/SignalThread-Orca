import { NextRequest, NextResponse } from "next/server";
import {
  deleteSessionFnbCatalogAssignment,
  FnbCatalogError,
  updateSessionFnbCatalogAssignment,
} from "@/lib/fnb-catalog";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof FnbCatalogError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

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

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; assignmentId: string }> },
) {
  const { eventId, sessionId, assignmentId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "write");
    const assignment = await updateSessionFnbCatalogAssignment(eventId, sessionId, assignmentId, body);
    return NextResponse.json(assignment);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId/fnb-catalog-assignments/:assignmentId");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; assignmentId: string }> },
) {
  const { eventId, sessionId, assignmentId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    await assertEventAccessForUser(eventId, authResult.user, "write");
    const assignment = await deleteSessionFnbCatalogAssignment(eventId, sessionId, assignmentId);
    return NextResponse.json(assignment);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/fnb-catalog-assignments/:assignmentId");
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId/fnb-catalog-assignments/:assignmentId",
  patchHandler,
);
export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/fnb-catalog-assignments/:assignmentId",
  deleteHandler,
);
