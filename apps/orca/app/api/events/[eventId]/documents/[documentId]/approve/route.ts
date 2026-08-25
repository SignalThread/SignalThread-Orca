import { NextRequest, NextResponse } from "next/server";
import { approveDocument, DocumentServiceError } from "@/src/server/services/documents";
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

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; documentId: string }> },
) {
  const { eventId, documentId } = await params;

  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      { error: currentUserResult.error.status === 403 ? "Forbidden" : "Unauthorized" },
      { status: currentUserResult.error.status },
    );
  }
  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/documents/:documentId/approve");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const payload = await approveDocument(eventId, documentId, {
      ...body,
      actedByUserId: currentUserResult.user.id,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/documents/:documentId/approve");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/documents/:documentId/approve", postHandler);
