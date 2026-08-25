import { NextRequest, NextResponse } from "next/server";
import {
  createFnbParserFeedback,
  FnbParserFeedbackError,
} from "@/lib/fnb-parser-feedback";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof FnbParserFeedbackError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("POST /api/events/:eventId/fnb-catalog/parser-feedback failed", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const feedback = await createFnbParserFeedback({
      ...body,
      eventId,
    });
    return NextResponse.json({ id: feedback.id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/fnb-catalog/parser-feedback", postHandler);
