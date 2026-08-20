import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  linkSpeakerDocumentToDocsHub,
  SpeakerDocumentError,
} from "@/src/server/services/speaker-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    {
      message: status === 403 ? "Forbidden" : "Unauthorized",
      reason,
      hint,
    },
    { status },
  );
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerDocumentError) {
    return NextResponse.json(
      { error: error.message, ...(error.reason ? { reason: error.reason } : {}) },
      { status: error.status },
    );
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; speakerId: string; requestId: string }> },
) {
  const { eventId, speakerId, requestId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Body is optional for this action.
  }

  try {
    const updated = await linkSpeakerDocumentToDocsHub(eventId, speakerId, requestId, authResult.user, {
      categoryId: body.categoryId,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(
      error,
      "POST /api/events/:eventId/speakers/:speakerId/documents/:requestId/link-docs-hub",
    );
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/speakers/:speakerId/documents/:requestId/link-docs-hub",
  postHandler,
);
