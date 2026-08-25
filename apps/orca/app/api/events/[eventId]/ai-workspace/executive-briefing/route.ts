import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { EventCommandCenterServiceError, getEventCommandCenter } from "@/src/server/services/event-command-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventIdSchema = z.string().uuid();

type ExecutiveBriefingRouteDependencies = {
  resolveUser: typeof resolveRequestUser;
  retrieveCommandCenter: typeof getEventCommandCenter;
};

export function createExecutiveBriefingGetHandler(overrides: Partial<ExecutiveBriefingRouteDependencies> = {}) {
  const deps: ExecutiveBriefingRouteDependencies = {
    resolveUser: overrides.resolveUser ?? resolveRequestUser,
    retrieveCommandCenter: overrides.retrieveCommandCenter ?? getEventCommandCenter,
  };

  return async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
    const auth = await deps.resolveUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { message: auth.error.status === 403 ? "Forbidden" : "Unauthorized", reason: auth.error.reason, hint: auth.error.hint },
        { status: auth.error.status },
      );
    }

    try {
      const eventId = eventIdSchema.parse((await params).eventId);
      const result = await deps.retrieveCommandCenter(eventId, auth.user);
      return NextResponse.json(result.event.executiveBriefing, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      observeHandledRouteError(error);
      if (error instanceof ZodError) return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
      if (error instanceof EventCommandCenterServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error("GET /api/events/:eventId/ai-workspace/executive-briefing failed");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

const getHandler = createExecutiveBriefingGetHandler();
export const GET = withApiRequestLogging("GET /api/events/:eventId/ai-workspace/executive-briefing", getHandler);
