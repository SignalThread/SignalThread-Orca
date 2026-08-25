import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveRequestUser } from "@/lib/request-user";
import { reorderTimelineItemSchema } from "@/lib/timeline/types";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { reorderTimelineItem, TimelineServiceError } from "@/src/server/services/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ message: auth.error.status === 403 ? "Forbidden" : "Unauthorized", reason: auth.error.reason, hint: auth.error.hint }, { status: auth.error.status });
  try {
    const input = reorderTimelineItemSchema.parse(await request.json());
    return NextResponse.json(await reorderTimelineItem((await params).eventId, auth.user, input));
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof ZodError) return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
    if (error instanceof TimelineServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Log the cause. Without it a reorder failure is indistinguishable from any other 500.
    console.error("POST /api/events/:eventId/timeline-items/reorder failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/timeline-items/reorder", postHandler);
