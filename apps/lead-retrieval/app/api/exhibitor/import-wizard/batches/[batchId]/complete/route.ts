import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";
import { completeImportBatch } from "@/lib/server/import-wizard/import-batch-service";

type RouteCtx = { params: Promise<{ batchId: string }> };

/**
 * POST { "action": "publish" | "discard" } — finishes the active draft (allows a new draft afterward).
 */
export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { batchId } = await ctx.params;
    const id = String(batchId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    }

    const body = (await request.json()) as { action?: string };
    const action = body.action === "publish" || body.action === "discard" ? body.action : null;
    if (!action) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    try {
      const url = new URL(request.url);
      const requestedEventId = url.searchParams.get("eventId");
      const activeEventId =
        action === "publish" ? await resolveExhibitorAppActiveEventId(session.userId, requestedEventId) : null;
      if (action === "publish" && !activeEventId) {
        return NextResponse.json({ error: "Select an accessible event before importing leads." }, { status: 400 });
      }

      const result = await completeImportBatch(id, companyId, action, {
        ownerUserId: action === "publish" ? session.userId : undefined,
        eventId: activeEventId,
      });
      return NextResponse.json({
        ok: true,
        ...(action === "publish" && typeof result.importedCount === "number"
          ? { importedCount: result.importedCount }
          : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "batch_not_found") {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (msg === "batch_not_draft") {
        return NextResponse.json({ error: "Batch is not an active draft." }, { status: 409 });
      }
      if (msg === "missing_owner_for_publish") {
        return NextResponse.json({ error: "Missing user scope for import." }, { status: 400 });
      }
      if (msg === "batch_validation_failed") {
        return NextResponse.json(
          { error: "Fix all blocking identity issues before importing this batch." },
          { status: 409 }
        );
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
