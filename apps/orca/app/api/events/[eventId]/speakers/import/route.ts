import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { exceedsImportRowLimit, importRowLimitError } from "@/lib/import";
import { importSpeakersFromMappedRows, type SpeakerCsvImportRow, SpeakerServiceError } from "@/src/server/services/speakers";

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

  if (error instanceof SpeakerServiceError) {
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

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }

  if (exceedsImportRowLimit(body.rows.length)) {
    return NextResponse.json(importRowLimitError(body.rows.length), { status: 413 });
  }

  if (body.rows.some((row) => typeof row !== "object" || row === null || Array.isArray(row))) {
    return NextResponse.json({ error: "rows must contain objects" }, { status: 400 });
  }

  try {
    const summary = await importSpeakersFromMappedRows(eventId, authResult.user, body.rows as SpeakerCsvImportRow[]);
    return NextResponse.json(summary);
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/speakers/import");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/speakers/import", postHandler);
