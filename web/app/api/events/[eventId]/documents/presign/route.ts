import { NextRequest, NextResponse } from "next/server";
import { createDocumentUploadPresign, DocumentServiceError } from "@/src/server/services/documents";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";

export const runtime = "nodejs";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Unauthorized", reason, hint },
    { status },
  );
}

function toErrorResponse(error: unknown, context: string) {
  observeHandledRouteError(error);

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }

  if (error instanceof DocumentServiceError) {
    console.error(`${context} -> ${error.status}: ${error.message}`);
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

  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return toAuthErrorResponse(
      currentUserResult.error.status,
      currentUserResult.error.reason,
      currentUserResult.error.hint,
    );
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/documents/presign");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const payload = await createDocumentUploadPresign(eventId, body);
    console.info(`POST /api/events/${eventId}/documents/presign -> 200 (documentId=${String(body.documentId ?? "")})`);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/documents/presign");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/documents/presign", postHandler);
