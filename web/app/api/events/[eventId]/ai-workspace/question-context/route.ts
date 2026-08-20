import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { EventAttentionError } from "@/src/server/services/event-attention";
import { getEventQuestionContext } from "@/src/server/services/event-question-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventIdSchema = z.string().uuid();
const requestSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(1000, "Question must be 1000 characters or fewer"),
});

type QuestionContextRouteDependencies = {
  resolveUser: typeof resolveRequestUser;
  retrieveContext: typeof getEventQuestionContext;
};

export function createQuestionContextPostHandler(
  overrides: Partial<QuestionContextRouteDependencies> = {},
) {
  const deps: QuestionContextRouteDependencies = {
    resolveUser: overrides.resolveUser ?? resolveRequestUser,
    retrieveContext: overrides.retrieveContext ?? getEventQuestionContext,
  };

  return async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
    const { eventId: rawEventId } = await params;
    const auth = await deps.resolveUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { message: auth.error.status === 403 ? "Forbidden" : "Unauthorized", reason: auth.error.reason, hint: auth.error.hint },
        { status: auth.error.status },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Validation failed", issues: [{ message: "Request body must be valid JSON" }] }, { status: 400 });
    }

    try {
      const { question } = requestSchema.parse(body);
      const result = await deps.retrieveContext(eventIdSchema.parse(rawEventId), auth.user, question);
      return NextResponse.json(result);
    } catch (error) {
      observeHandledRouteError(error);
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
      }
      if (error instanceof EventAttentionError) {
        return NextResponse.json({ error: error.message, ...(error.reason ? { reason: error.reason } : {}) }, { status: error.status });
      }
      console.error("POST /api/events/:eventId/ai-workspace/question-context failed");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

const postHandler = createQuestionContextPostHandler();
export const POST = withApiRequestLogging("POST /api/events/:eventId/ai-workspace/question-context", postHandler);
