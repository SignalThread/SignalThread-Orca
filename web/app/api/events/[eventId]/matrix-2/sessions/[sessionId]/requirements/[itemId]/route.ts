import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { SessionRequirementError, removeSessionRequirementSelection } from "@/lib/session-requirements";
import { requireEventRouteAccess } from "../../../../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SessionRequirementError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function deleteRequirementSelectionRoute(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; itemId: string }> },
) {
  const { eventId, sessionId, itemId } = await params;

  try {
    const auth = await requireEventRouteAccess(request, eventId, "write");
    if ("response" in auth) return auth.response;

    await removeSessionRequirementSelection({
      eventId,
      sessionId,
      itemId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(
      error,
      "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/requirements/:itemId",
    );
  }
}

export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/requirements/:itemId",
  deleteRequirementSelectionRoute,
);
