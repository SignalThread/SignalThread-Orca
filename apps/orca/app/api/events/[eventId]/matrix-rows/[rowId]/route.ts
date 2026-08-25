import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { deleteMatrixRow, MatrixError, updateMatrixRow } from "@/lib/matrix";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }

  if (error instanceof MatrixError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; rowId: string }> },
) {
  const { eventId, rowId } = await params;

  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      {
        error: currentUserResult.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: currentUserResult.error.reason,
        hint: currentUserResult.error.hint,
      },
      { status: currentUserResult.error.status },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const allowedFields = new Set([
    "date",
    "startTime",
    "endTime",
    "roomId",
    "room",
    "sessionName",
    "setup",
    "attendance",
    "meal",
    "avNeeds",
    "notes",
    "sortOrder",
  ]);

  const unknownKeys = Object.keys(body).filter((key) => !allowedFields.has(key));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown fields: ${unknownKeys.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
    const row = await updateMatrixRow(eventId, rowId, body, { id: currentUserResult.user.id });
    return NextResponse.json(row);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/matrix-rows/:rowId");
  }
}

async function deleteHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; rowId: string }> },
) {
  const { eventId, rowId } = await params;

  const currentUserResult = await resolveRequestUser(_request);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      {
        error: currentUserResult.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: currentUserResult.error.reason,
        hint: currentUserResult.error.hint,
      },
      { status: currentUserResult.error.status },
    );
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
    await deleteMatrixRow(eventId, rowId, { id: currentUserResult.user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/matrix-rows/:rowId");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId/matrix-rows/:rowId", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/matrix-rows/:rowId", deleteHandler);
