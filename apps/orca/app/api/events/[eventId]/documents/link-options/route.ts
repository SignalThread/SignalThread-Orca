import { NextRequest, NextResponse } from "next/server";
import { DocumentServiceError, listDocumentLinkOptions } from "@/src/server/services/documents";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";

export const runtime = "nodejs";

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

    await assertEventAccessForUser(eventId, currentUserResult.user, "read");
    const payload = await listDocumentLinkOptions(eventId);
    return NextResponse.json({
      budgetItems: Array.isArray(payload?.budgetItems) ? payload.budgetItems : [],
      deadlines: Array.isArray(payload?.deadlines) ? payload.deadlines : [],
      matrixSessions: Array.isArray(payload?.matrixSessions) ? payload.matrixSessions : [],
    });
  } catch (error) {
    observeHandledRouteError(error);

    if (error instanceof EventAccessError) {
      return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
    }

    if (error instanceof DocumentServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("GET /api/events/:eventId/documents/link-options failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/documents/link-options", getHandler);
