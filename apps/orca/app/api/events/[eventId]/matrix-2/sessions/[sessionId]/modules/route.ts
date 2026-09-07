import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../../../../_lib/event-route-auth";
import {
  getSessionModuleSettings,
  SessionModuleApplicabilityError,
  updateSessionModuleOverride,
} from "@/lib/session-module-applicability";

export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof SessionModuleApplicabilityError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Session module applicability route failed", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read"); if ("response" in auth) return auth.response;
  try { return NextResponse.json(await getSessionModuleSettings(eventId, sessionId)); } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write"); if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateSessionModuleOverride({ eventId, sessionId, module: body.module, enabled: body.enabled, inherit: body.inherit }));
  } catch (error) { return failure(error); }
}
