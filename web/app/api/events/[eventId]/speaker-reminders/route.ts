import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  previewSpeakerReminders,
  sendSpeakerReminders,
  SpeakerReminderError,
} from "@/src/server/services/speaker-reminders";

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

  if (error instanceof SpeakerReminderError) {
    return NextResponse.json(
      { error: error.message, ...(error.reason ? { reason: error.reason } : {}) },
      { status: error.status },
    );
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const kind = request.nextUrl.searchParams.get("kind");
    const preview = await previewSpeakerReminders(eventId, authResult.user, kind);
    return NextResponse.json(preview);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speaker-reminders");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await sendSpeakerReminders(eventId, authResult.user, {
      kind: body.kind,
      speakerIds: body.speakerIds,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speaker-reminders");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/speaker-reminders", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/speaker-reminders", postHandler);
