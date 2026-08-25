import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  createTimelineDependencySchema,
  deleteTimelineDependencySchema,
} from "@/lib/timeline/types";
import {
  createTimelineDependency,
  deleteTimelineDependency,
  listTimelineDependencies,
  TimelineServiceError,
} from "@/src/server/services/timeline";

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

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: error.issues },
      { status: 400 },
    );
  }

  if (error instanceof TimelineServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
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
    return toAuthErrorResponse(
      authResult.error.status,
      authResult.error.reason,
      authResult.error.hint,
    );
  }

  let body: unknown = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const parsedBody = createTimelineDependencySchema.parse(body);
    const dependency = await createTimelineDependency(eventId, authResult.user, parsedBody);
    return NextResponse.json(dependency, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/timeline-dependencies");
  }
}

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  try {
    return NextResponse.json(await listTimelineDependencies((await params).eventId, authResult.user));
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/timeline-dependencies");
  }
}

async function deleteHandler(
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

  let dependencyId = request.nextUrl.searchParams.get("id");

  if (!dependencyId) {
    try {
      const rawBody = await request.text();
      if (rawBody.trim()) {
        const parsedJson = JSON.parse(rawBody) as { id?: string };
        dependencyId = parsedJson.id ?? null;
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  try {
    const parsedBody = deleteTimelineDependencySchema.parse({
      id: dependencyId ?? undefined,
    });
    const dependency = await deleteTimelineDependency(
      eventId,
      parsedBody.id,
      authResult.user,
    );
    return NextResponse.json(dependency);
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/events/:eventId/timeline-dependencies");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/timeline-dependencies", postHandler);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId/timeline-dependencies", deleteHandler);
export const GET = withApiRequestLogging("GET /api/events/:eventId/timeline-dependencies", getHandler);
