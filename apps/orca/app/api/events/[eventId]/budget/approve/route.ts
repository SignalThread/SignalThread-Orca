// DEAD-CODE FOLLOW-UP: This budget-level approve route is UI-orphaned. The live
// approval workflow uses /budget/submissions/:submissionId/approve. Retained for
// now; see production-readiness follow-ups before removal.
import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError, approveBudget } from "@/src/server/services/budget";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../_lib/route-auth";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof BudgetServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  try {
    const budget = await approveBudget(eventId, auth.user.id);
    return NextResponse.json(budget);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/budget/approve");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/approve", postHandler);
