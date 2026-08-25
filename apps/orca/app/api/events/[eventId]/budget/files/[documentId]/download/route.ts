import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { BudgetServiceError, getBudgetFileDownload } from "@/src/server/services/budget";

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
  { params }: { params: Promise<{ eventId: string; documentId: string }> },
) {
  const { eventId, documentId } = await params;

  try {
    const currentUserResult = await resolveRequestUser(request);
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }

    const payload = await getBudgetFileDownload(eventId, documentId, {
      id: currentUserResult.user.id,
      orgId: currentUserResult.user.orgId,
      role: currentUserResult.user.role,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/budget/files/:documentId/download");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/files/:documentId/download", getHandler);
