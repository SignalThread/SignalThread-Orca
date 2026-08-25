import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { EventAttentionError, getEventAttention } from "@/src/server/services/event-attention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventIdSchema = z.string().uuid();

type AttentionRouteDependencies = {
  resolveUser: typeof resolveRequestUser;
  retrieveAttention: typeof getEventAttention;
};

export function createAttentionGetHandler(
  overrides: Partial<AttentionRouteDependencies> = {},
) {
  const deps: AttentionRouteDependencies = {
    resolveUser: overrides.resolveUser ?? resolveRequestUser,
    retrieveAttention: overrides.retrieveAttention ?? getEventAttention,
  };

  return async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
    const { eventId: rawEventId } = await params;
    const auth = await deps.resolveUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { message: auth.error.status === 403 ? "Forbidden" : "Unauthorized", reason: auth.error.reason, hint: auth.error.hint },
        { status: auth.error.status },
      );
    }

    try {
      const result = await deps.retrieveAttention(eventIdSchema.parse(rawEventId), auth.user);
      return NextResponse.json(result);
    } catch (error) {
      observeHandledRouteError(error);
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
      }
      if (error instanceof EventAttentionError) {
        return NextResponse.json({ error: error.message, ...(error.reason ? { reason: error.reason } : {}) }, { status: error.status });
      }
      console.error("GET /api/events/:eventId/ai-workspace/attention failed");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

const getHandler = createAttentionGetHandler();
export const GET = withApiRequestLogging("GET /api/events/:eventId/ai-workspace/attention", getHandler);
