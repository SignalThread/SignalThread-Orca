import { NextRequest, NextResponse } from "next/server";
import { BudgetServiceError, getBudgetLineItemIds } from "@/src/server/services/budget";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../../_lib/route-auth";
import { parsePagedLineItemsQuery } from "../../_lib/paged-query";

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
    // Reuse the paged-rows filter/search/sort parsing so ids-only selection
    // matches the visible filtered set exactly (page/pageSize are ignored here —
    // this returns every matching id, not one page).
    const query = parsePagedLineItemsQuery(request.nextUrl.searchParams);
    const result = await getBudgetLineItemIds(eventId, query);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/line-items/ids");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/line-items/ids", getHandler);
