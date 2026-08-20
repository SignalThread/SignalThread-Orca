import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createPortalSpeakerMessage,
  listPortalSpeakerMessages,
  SpeakerCommsError,
} from "@/src/server/services/speaker-comms";
import { SpeakerPortalTokenError } from "@/src/server/services/speaker-portal-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerPortalTokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SpeakerCommsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const messages = await listPortalSpeakerMessages(token);
    return NextResponse.json(messages);
  } catch (error) {
    return toErrorResponse(error, "GET /api/public/speaker-portal/:token/messages");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const created = await createPortalSpeakerMessage(token, { body: body.body });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/public/speaker-portal/:token/messages");
  }
}

export const GET = withApiRequestLogging("GET /api/public/speaker-portal/:token/messages", getHandler);
export const POST = withApiRequestLogging("POST /api/public/speaker-portal/:token/messages", postHandler);
