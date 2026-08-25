import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../../../../_lib/event-route-auth";
import {
  getSessionFnbSafetySummary,
  resolveSessionFnbSafety,
  SessionFnbSafetyError,
  upsertSessionFnbRequirement,
} from "@/lib/session-fnb-safety";

function errorResponse(error: unknown) {
  if (error instanceof SessionFnbSafetyError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error("Session F&B safety request failed", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;
  try { return NextResponse.json(await getSessionFnbSafetySummary(eventId, sessionId)); } catch (error) { return errorResponse(error); }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try { return NextResponse.json(await upsertSessionFnbRequirement(eventId, sessionId, auth.user.id, await request.json())); } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try { return NextResponse.json(await resolveSessionFnbSafety(eventId, sessionId, auth.user.id, await request.json())); } catch (error) { return errorResponse(error); }
}
