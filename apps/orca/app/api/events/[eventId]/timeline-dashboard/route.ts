import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import {
  getEventTimelineDashboard,
  TimelineDashboardError,
} from "@/src/server/services/timeline-dashboard";

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

  if (error instanceof TimelineDashboardError) {
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
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(
      authResult.error.status,
      authResult.error.reason,
      authResult.error.hint,
    );
  }

  try {
    const selectedWorkstream = request.nextUrl.searchParams.get("workstream") ?? undefined;
    const payload = await getEventTimelineDashboard(eventId, authResult.user, {
      selectedWorkstream,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/timeline-dashboard");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/timeline-dashboard", getHandler);
