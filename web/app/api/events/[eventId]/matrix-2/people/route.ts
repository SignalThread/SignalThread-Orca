import { NextRequest, NextResponse } from "next/server";
import { Matrix2Error, createMatrix2Person, listMatrix2People } from "@/lib/matrix2";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof Matrix2Error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function listMatrix2PeopleRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId } = await params;

  try {
    const auth = await requireEventRouteAccess(nextRequest, eventId, "read");
    if ("response" in auth) return auth.response;

    const people = await listMatrix2People(eventId);
    return NextResponse.json(people);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/matrix-2/people");
  }
}

async function createMatrix2PersonRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId } = await params;

  const auth = await requireEventRouteAccess(nextRequest, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await nextRequest.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const person = await createMatrix2Person(eventId, body);
    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/matrix-2/people");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/matrix-2/people", listMatrix2PeopleRoute);
export const POST = withApiRequestLogging("POST /api/events/:eventId/matrix-2/people", createMatrix2PersonRoute);
