import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError } from "@/src/server/services/budget";
import { getBudgetBlocksSummary } from "@/src/server/services/budget-sessions-groups";
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

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;

  try {
    const summary = await getBudgetBlocksSummary(eventId);
    return NextResponse.json(summary);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/blocks");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/blocks", getHandler);
