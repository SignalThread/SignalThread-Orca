import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { SessionRequirementError, updateSessionRequirementBudgetLink } from "@/lib/session-requirements";
import { requireEventRouteAccess } from "../../../../../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SessionRequirementError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function patchBudgetLinkRoute(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; itemId: string }> },
) {
  const { eventId, sessionId, itemId } = await params;

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const budgetLineItemId = typeof body.budgetLineItemId === "string" ? body.budgetLineItemId.trim() : "";
  if (!budgetLineItemId) {
    return NextResponse.json({ error: "budgetLineItemId is required" }, { status: 400 });
  }

  try {
    const updated = await updateSessionRequirementBudgetLink({
      eventId,
      sessionId,
      itemId,
      budgetLineItemId,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(
      error,
      "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId/requirements/:itemId/budget-link",
    );
  }
}

async function deleteBudgetLinkRoute(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; sessionId: string; itemId: string }> },
) {
  const { eventId, sessionId, itemId } = await params;

  try {
    const auth = await requireEventRouteAccess(request, eventId, "write");
    if ("response" in auth) return auth.response;

    const updated = await updateSessionRequirementBudgetLink({
      eventId,
      sessionId,
      itemId,
      budgetLineItemId: null,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(
      error,
      "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/requirements/:itemId/budget-link",
    );
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId/requirements/:itemId/budget-link",
  patchBudgetLinkRoute,
);

export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/matrix-2/sessions/:sessionId/requirements/:itemId/budget-link",
  deleteBudgetLinkRoute,
);
