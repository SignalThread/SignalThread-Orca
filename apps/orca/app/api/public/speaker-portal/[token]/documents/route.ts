import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import {
  listPortalSpeakerDocumentRequests,
  SpeakerDocumentError,
} from "@/src/server/services/speaker-documents";
import { SpeakerFileError } from "@/src/server/services/speaker-files";
import { SpeakerPortalTokenError } from "@/src/server/services/speaker-portal-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof SpeakerPortalTokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SpeakerDocumentError || error instanceof SpeakerFileError) {
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
    const requests = await listPortalSpeakerDocumentRequests(token);
    return NextResponse.json(requests);
  } catch (error) {
    return toErrorResponse(error, "GET /api/public/speaker-portal/:token/documents");
  }
}

export const GET = withApiRequestLogging("GET /api/public/speaker-portal/:token/documents", getHandler);
