import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { BudgetServiceError, createBudgetFileUploadPresign } from "@/src/server/services/budget";

export const runtime = "nodejs";

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const currentUserResult = await resolveRequestUser(request);
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }

    const payload = await createBudgetFileUploadPresign(eventId, body, {
      id: currentUserResult.user.id,
      orgId: currentUserResult.user.orgId,
      role: currentUserResult.user.role,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/budget/files/presign");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/files/presign", postHandler);
