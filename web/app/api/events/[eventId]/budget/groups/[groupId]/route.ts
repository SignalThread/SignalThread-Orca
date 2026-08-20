import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError } from "@/src/server/services/budget";
import { deleteBudgetGroup } from "@/src/server/services/budget-sessions-groups";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../../_lib/route-auth";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  if (error instanceof BudgetServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; groupId: string }> },
) {
  const { eventId, groupId } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  try {
    const group = await deleteBudgetGroup(eventId, groupId, auth.user);
    return NextResponse.json({ group });
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/budget/groups/:groupId");
  }
}

export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/budget/groups/:groupId",
  deleteHandler,
);
