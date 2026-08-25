import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import {
  BudgetServiceError,
  exportBudgetSummaryCsv,
} from "@/src/server/services/budget";

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

    const payload = await exportBudgetSummaryCsv(eventId, {
      id: currentUserResult.user.id,
      orgId: currentUserResult.user.orgId,
      role: currentUserResult.user.role,
    });
    return new NextResponse(payload.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${payload.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/export/summary.csv");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/export/summary.csv", getHandler);
