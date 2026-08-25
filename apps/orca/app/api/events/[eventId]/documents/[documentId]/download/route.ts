import { NextRequest, NextResponse } from "next/server";
import { DocumentServiceError, getDownloadForDocument } from "@/src/server/services/documents";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string) {
  observeHandledRouteError(error);

  if (error instanceof DocumentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
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

    await assertEventAccessForUser(eventId, currentUserResult.user, "read");
    const payload = await getDownloadForDocument(eventId, documentId);
    return NextResponse.json({ url: payload.url });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/documents/:documentId/download");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/documents/:documentId/download", getHandler);
