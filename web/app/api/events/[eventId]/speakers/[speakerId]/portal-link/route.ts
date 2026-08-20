import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  generateSpeakerPortalToken,
  getSpeakerPortalTokenStatus,
  revokeSpeakerPortalTokens,
  SpeakerPortalTokenError,
} from "@/src/server/services/speaker-portal-tokens";

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

  if (error instanceof SpeakerPortalTokenError) {
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
  { params }: { params: Promise<{ eventId: string; speakerId: string }> },
) {
  const { eventId, speakerId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const grant = await generateSpeakerPortalToken(eventId, speakerId, authResult.user, {
      origin: request.nextUrl.origin,
    });

    return NextResponse.json(grant);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speakers/:speakerId/portal-link");
  }
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; speakerId: string }> },
) {
  const { eventId, speakerId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const status = await getSpeakerPortalTokenStatus(eventId, speakerId, authResult.user);
    return NextResponse.json({ status });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speakers/:speakerId/portal-link");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; speakerId: string }> },
) {
  const { eventId, speakerId } = await params;
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  try {
    const result = await revokeSpeakerPortalTokens(eventId, speakerId, authResult.user);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/speakers/:speakerId/portal-link");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/speakers/:speakerId/portal-link",
  postHandler,
);
export const GET = withApiRequestLogging(
  "GET /api/events/:eventId/speakers/:speakerId/portal-link",
  getHandler,
);
export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/speakers/:speakerId/portal-link",
  deleteHandler,
);
