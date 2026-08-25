import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError, decideBudgetSubmission } from "@/src/server/services/budget";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../../../_lib/route-auth";

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
  { params }: { params: Promise<{ eventId: string; submissionId: string }> },
) {
  const { eventId, submissionId } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  try {
    const submission = await decideBudgetSubmission(eventId, submissionId, "APPROVED", auth.user.id);
    return NextResponse.json(submission);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/budget/submissions/:submissionId/approve");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/submissions/:submissionId/approve", postHandler);
