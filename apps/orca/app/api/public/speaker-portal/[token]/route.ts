import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { getSpeakerPortalView, SpeakerPortalError } from "@/src/server/services/speaker-portal";
import { SpeakerPortalTokenError } from "@/src/server/services/speaker-portal-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerPortalTokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SpeakerPortalError) {
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
    const view = await getSpeakerPortalView(token);
    return NextResponse.json(view);
  } catch (error) {
    return toErrorResponse(error, "GET /api/public/speaker-portal/:token");
  }
}

export const GET = withApiRequestLogging("GET /api/public/speaker-portal/:token", getHandler);
