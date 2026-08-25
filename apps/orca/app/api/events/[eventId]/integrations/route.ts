import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  interpretCapabilities,
  EventIntegrationError,
  listEventIntegrationConnections,
  upsertEventIntegrationConnection,
} from "@/src/server/services/event-integration";
import { resolveAttendeeUser, toAttendeeErrorResponse } from "../attendees/_lib/route-helpers";

export const runtime = "nodejs";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }): Promise<NextResponse> {
  const { eventId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;
  try {
    const connections = await listEventIntegrationConnections({ eventId, user: auth.user });
    // Surface derived behavior so the UI never has to assume writeback exists.
    const withInterpretation = connections.map((c) => ({
      ...c,
      interpretation: interpretCapabilities(c),
    }));
    return NextResponse.json({ connections: withInterpretation });
  } catch (error) {
    return toAttendeeErrorResponse(error, "GET /api/events/:eventId/integrations");
  }
}

async function putHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }): Promise<NextResponse> {
  const { eventId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const allowed = new Set(["provider", "externalEventId", "connectionStatus", "syncMode", "capabilities"]);
    const unknown = Object.keys(body).find((key) => !allowed.has(key));
    if (unknown) return NextResponse.json({ error: `Unknown field: ${unknown}`, code: "BAD_REQUEST" }, { status: 400 });
    if (typeof body.provider !== "string") return NextResponse.json({ error: "provider is required", code: "INVALID_PROVIDER" }, { status: 400 });
    const connection = await upsertEventIntegrationConnection({
      eventId,
      user: auth.user,
      provider: body.provider,
      externalEventId: body.externalEventId as string | null | undefined,
      connectionStatus: body.connectionStatus,
      syncMode: body.syncMode,
      capabilities: body.capabilities,
    });
    return NextResponse.json({ connection });
  } catch (error) {
    if (error instanceof EventIntegrationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return toAttendeeErrorResponse(error, "PUT /api/events/:eventId/integrations");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/integrations", getHandler);
export const PUT = withApiRequestLogging("PUT /api/events/:eventId/integrations", putHandler);
