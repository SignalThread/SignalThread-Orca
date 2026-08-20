import { NextRequest, NextResponse } from "next/server";
import { duplicateMatrixRow, MatrixError } from "@/lib/matrix";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof MatrixError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; rowId: string }> },
) {
  const { eventId, rowId } = await params;

  try {
    const auth = await requireEventRouteAccess(request, eventId, "write");
    if ("response" in auth) return auth.response;

    const duplicated = await duplicateMatrixRow(eventId, rowId, { id: auth.user.id });
    return NextResponse.json(duplicated, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/matrix-rows/:rowId/duplicate");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/matrix-rows/:rowId/duplicate", postHandler);
