import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import {
  BudgetServiceError,
  exportBudgetLineItemsCsv,
} from "@/src/server/services/budget";
import { parsePagedLineItemsQuery } from "../../_lib/paged-query";

export const runtime = "nodejs";

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

  try {
    const currentUserResult = await resolveRequestUser(request);
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }

    // `filtered=1` exports the current filtered view (same filter/search/sort as
    // the paged rows endpoint); otherwise the full Budget is exported.
    const isFiltered = request.nextUrl.searchParams.get("filtered") === "1";
    const filters = isFiltered ? parsePagedLineItemsQuery(request.nextUrl.searchParams) : undefined;
    const payload = await exportBudgetLineItemsCsv(
      eventId,
      {
        id: currentUserResult.user.id,
        orgId: currentUserResult.user.orgId,
        role: currentUserResult.user.role,
      },
      filters ? { filters } : undefined,
    );
    return new NextResponse(payload.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${payload.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/export/line-items.csv");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/export/line-items.csv", getHandler);
