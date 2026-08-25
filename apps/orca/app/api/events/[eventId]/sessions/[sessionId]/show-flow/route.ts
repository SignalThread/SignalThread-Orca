import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../../../_lib/event-route-auth";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  applySessionShowFlowTemplate,
  copySessionShowFlow,
  getSessionShowFlowWorkspace,
  listSessionShowFlow,
  replaceSessionShowFlow,
  setSessionShowFlowApproval,
  SessionShowFlowError,
} from "@/lib/session-show-flow";

export const runtime = "nodejs";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;
  try {
    if (request.nextUrl.searchParams.get("mode") === "workspace") {
      return NextResponse.json({
        ...await getSessionShowFlowWorkspace(eventId, sessionId),
        permissions: { canEdit: auth.canEdit },
      });
    }
    return NextResponse.json(await listSessionShowFlow(eventId, sessionId));
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load show flow" }, { status: error instanceof SessionShowFlowError ? error.status : 500 }); }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/sessions/:sessionId/show-flow", getHandler);

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as { action?: unknown; template?: unknown; sourceSessionId?: unknown; expectedRevision?: unknown };
    if (body.action === "apply-template") {
      return NextResponse.json(await applySessionShowFlowTemplate(eventId, sessionId, { template: body.template, expectedRevision: body.expectedRevision, actorUserId: auth.user.id }));
    }
    if (body.action === "copy-session") {
      return NextResponse.json(await copySessionShowFlow(eventId, sessionId, { sourceSessionId: body.sourceSessionId, expectedRevision: body.expectedRevision, actorUserId: auth.user.id }));
    }
    throw new SessionShowFlowError("Unknown Show Flow action");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update Show Flow", ...(error instanceof SessionShowFlowError ? { code: error.code } : {}) },
      { status: error instanceof SessionShowFlowError ? error.status : 400 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as { status?: unknown; expectedRevision?: unknown };
    return NextResponse.json(await setSessionShowFlowApproval(eventId, sessionId, {
      status: body.status,
      expectedRevision: body.expectedRevision,
      actorUserId: auth.user.id,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update Show Flow approval", ...(error instanceof SessionShowFlowError ? { code: error.code } : {}) },
      { status: error instanceof SessionShowFlowError ? error.status : 400 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as { items?: unknown; expectedRevision?: unknown; publicDescription?: unknown };
    return NextResponse.json(await replaceSessionShowFlow(eventId, sessionId, body.items, {
      expectedRevision: body.expectedRevision,
      publicDescription: body.publicDescription,
      actorUserId: auth.user.id,
    }));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save show flow",
        ...(error instanceof SessionShowFlowError ? { code: error.code } : {}),
      },
      { status: error instanceof SessionShowFlowError ? error.status : 400 },
    );
  }
}
