// DEAD-CODE FOLLOW-UP: This budget-level reject route is UI-orphaned. The live
// approval workflow uses /budget/submissions/:submissionId/reject. Retained for
// now; see production-readiness follow-ups before removal.
import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError, rejectBudget } from "@/src/server/services/budget";
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const budget = await rejectBudget(eventId, body.reason, auth.user.id);
    return NextResponse.json(budget);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/budget/reject");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/reject", postHandler);
