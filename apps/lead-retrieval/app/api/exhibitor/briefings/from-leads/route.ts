import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createBriefWorkspaceFromLeadSelection } from "@/lib/server/briefings/create-brief-workspace-from-leads";
import { batchBriefingsPath } from "@/lib/import-wizard/paths";

function mapCreateError(error: unknown): NextResponse {
  const msg = error instanceof Error ? error.message : "";
  if (msg === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (msg === "missing_scope" || msg === "missing_event_scope") {
    return NextResponse.json({ error: "Missing exhibitor event scope." }, { status: 400 });
  }
  if (msg === "lead_selection_empty") {
    return NextResponse.json({ error: "Select at least one lead." }, { status: 400 });
  }
  if (msg === "lead_selection_too_large") {
    return NextResponse.json({ error: "Select fewer leads for one brief run." }, { status: 400 });
  }
  if (msg === "lead_selection_unauthorized") {
    return NextResponse.json({ error: "One or more leads are outside your event scope." }, { status: 403 });
  }
  return NextResponse.json({ error: msg || "Could not create brief workspace." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const session = await resolveApiSession(request);
    const body = (await request.json().catch(() => null)) as {
      eventId?: unknown;
      leadIds?: unknown;
    } | null;

    const leadIds = Array.isArray(body?.leadIds) ? body.leadIds.map((id) => String(id)) : [];
    const eventId = body?.eventId != null ? String(body.eventId).trim() || null : null;

    const result = await createBriefWorkspaceFromLeadSelection({
      userId: session.userId,
      role: session.role,
      companyId: session.companyId,
      eventId,
      leadIds,
    });

    return NextResponse.json({
      ok: true,
      batchId: result.batchId,
      eventId: result.eventId,
      leadIds: result.leadIds,
      workspaceUrl: batchBriefingsPath(result.batchId),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return mapCreateError(error);
  }
}
