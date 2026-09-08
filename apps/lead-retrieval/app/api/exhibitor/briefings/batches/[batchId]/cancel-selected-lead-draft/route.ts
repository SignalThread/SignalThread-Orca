import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { cancelSelectedLeadBriefWorkspace } from "@/lib/server/briefings/cancel-selected-lead-brief-workspace";

type RouteCtx = { params: Promise<{ batchId: string }> };

/**
 * POST — cancel an in-progress selected-lead briefing workspace.
 * Narrower than the list-card discard route: draft selected-lead runs only.
 */
export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    const userId = String(session.userId ?? "").trim();
    if (!companyId || !userId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { batchId } = await ctx.params;
    const id = String(batchId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    }

    try {
      const result = await cancelSelectedLeadBriefWorkspace({
        userId,
        role: String(session.role ?? ""),
        companyId,
        batchId: id,
      });
      return NextResponse.json({
        ok: true,
        previousStatus: result.previousStatus,
        selectedLeadCount: result.selectedLeadCount,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const code = typeof e === "object" && e ? String((e as { code?: unknown }).code ?? "") : "";
      if (msg === "batch_not_found") {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (msg === "selected_lead_workspace_only") {
        return NextResponse.json({ error: "Only selected-lead draft briefs can be canceled here." }, { status: 403 });
      }
      if (msg === "batch_not_draft") {
        return NextResponse.json({ error: "Only in-progress brief drafts can be canceled." }, { status: 409 });
      }
      if (msg === "selected_lead_workspace_incomplete") {
        return NextResponse.json({ error: "This brief cannot be canceled safely." }, { status: 409 });
      }
      if (code === "EVENT_ACCESS_DENIED") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      throw e;
    }
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
