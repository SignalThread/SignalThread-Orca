import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  exportSpeakerAssignmentsCsv,
  exportSpeakersCsv,
  SpeakerExportError,
} from "@/src/server/services/speaker-export";

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

  if (error instanceof SpeakerExportError) {
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

  const exportType = request.nextUrl.searchParams.get("type") ?? "speakers";

  try {
    const isAssignments = exportType === "assignments";
    const csv = isAssignments
      ? await exportSpeakerAssignmentsCsv(eventId, authResult.user)
      : await exportSpeakersCsv(eventId, authResult.user);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${isAssignments ? "speaker-assignments" : "speakers"}.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/speakers/export");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/speakers/export", getHandler);
