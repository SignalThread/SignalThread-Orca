import { NextRequest, NextResponse } from "next/server";
import { exportMatrixRowsCsv, MatrixError } from "@/lib/matrix";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof MatrixError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const date = request.nextUrl.searchParams.get("date");

  try {
    const auth = await requireEventRouteAccess(request, eventId, "read");
    if ("response" in auth) return auth.response;

    const payload = await exportMatrixRowsCsv(eventId, { date });
    return new NextResponse(payload.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${payload.filename}"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/matrix-rows/export.csv");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/matrix-rows/export.csv", getHandler);
